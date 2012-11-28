/*
 * jQuery.flickable v1.0b4
 *
 * Copyright (c) 2010 lagos
 * Dual licensed under the MIT and GPL licenses.
 *
 * http://lagoscript.org
 */
(function($, window, Math, undefined) {

    var flickable, 
        document = window.document,

        // Whether browser has touchScreen
        touchDevice = /iphone|ipod|ipad|android|blackberry/,

        isAndroid = /android/.test(navigator.userAgent.toLowerCase()),

        // Check if the target node is not needed to cancel default action.
        specialNodes = /^(input|textarea|select|option|button|embed|object)$/,
        specialNodesForTouch = new RegExp('^(input|textarea|select|option|button|embed|object|a' + (isAndroid ? '' : '|img') + ')$');

    // Inspired by jQuery UI
    $.fn.flickable = flickable = function(options) {
        if (typeof options === "string") { // method call
            var args = Array.prototype.slice.call(arguments, 1),
                returnValue = this;

            this.each(function() {
                var instance = $.data(this, 'flickable'),
                    value = instance && $.isFunction(instance[options]) ?
                        instance[options].apply(instance, args) : instance;

                if (value !== instance && value !== undefined) {
                    returnValue = value;
                    return false;
                }
            });

            return returnValue;
        } else {
            return this.each(function() {
                var instance = $.data(this, 'flickable');

                if (instance) {
                    $.extend(true, instance.options, options)
                    instance.init();
                } else {
                    $.data(this, 'flickable', new flickable.prototype.create(options, this));
                }
            });
        }
    };

    flickable.prototype = {
        options: {
            cancel: null,
            disabled: false,
            elasticConstant: 0.16,
            friction: 0.96,
            section: null,
            isDynamicWidth: false       //T.K true:フリックの横幅を動的に設定する
        },

        // Whether we drag
        canceled: false,

        // Don't append paddings if true
        noPadding: false,

        // Style names for layout
        layoutStyles: [
            'background-color', 'background-repeat', 'background-attachment', 'background-position', 'background-image',
            'padding-top', 'padding-right', 'padding-bottom', 'padding-left'
        ],

        create: function(options, elem) {
            var self = this,
                element = $(elem);

            this.originalElement  = element;
            this.options          = $.extend(true, {}, this.options, options);
            this.layoutStyles     = $.extend([], this.layoutStyles);
            this.client           = {x:0, y:0};
            this.inertialVelocity = {x:0, y:0};
            this.remainder        = {x:0, y:0};
            this.hasScroll        = {x:false, y:false};
            this.padding          = {};
            this.stretchPosition  = {};
            this.sectionPostions  = [];
            this.preventDefaultClick = false;

//T.K 変数定義
            this.sections           = null;     //セクション単位のフリックを有効にした時にセクション要素を格納する変数
            this.sectionValue       = null;     //セクションを表すセレクタ値
            this.selectedIndex      = 0;        //選択中のフリック要素を指すインデックス（ページ区切りの場合に有効）
            this.sectionIdPrev        = null;     //対象セクションの前セクションID
            this.sectionIdNext        = null;     //対象セクションの次セクションID
            this.isSectionReseting    = false;    //リセット中か
            this.isSectionLoading     = false     //セクションロード中か


            if (elem == window || elem == document || /^(html|body)$/i.test(elem.nodeName)) {
                // we don't support flick scrolling the entire page on touch device
                if (touchDevice.test(navigator.userAgent.toLowerCase())) return;

                this.box = $(window);
                this.elementWrapper = $('html');
                this.element = $('body');
                this.position = this.positionWindow;
                this.scroll = this.scrollWindow;

                // We need to copy width, border and margin if element is body
                this.layoutStyles.push('width');
                $.each(['top', 'right', 'bottom', 'left'], function(i, posName) {
                    self.layoutStyles.push(['margin', posName].join('-'));

                    $.each(['color', 'width', 'style'], function(j, type) {
                        self.layoutStyles.push(['border', posName, type].join('-'));
                    });
                });
            } else {
                // We don't need to sort out elements
                this.box = this.elementWrapper = this.element = element;
            }

            this.init();
        },

        init: function() {
            var self = this, scripts,
                element = this.element;

            if (!this.container) {
                // Change type of script element to avoid reevaluating those
                scripts = script(element).attr('type', 'text/plain');

                element.addClass('ui-flickable')
                    .append('<div style="clear:both;"/>')
                    .wrapInner(
                        '<div class="ui-flickable-container">' +
                        '<div class="ui-flickable-wrapper" style="padding:1px;">' +
                        '<div class="ui-flickable-content" style="position:relative;"/></div></div>'
                    );
                scripts.attr('type', 'text/javascript');

                this.container = element.children().bind('touchstart.flickable mousedown.flickable', function(event) {
                    return self.dragStart(event);
                }).bind('click.flickable', function(event) {
                    return self.clickHandler(event);
                });
                this.wrapper = this.container.children();
                this.content = this.wrapper.children();

                this.elementWrapper.bind('touchstart.flickable mousedown.flickable keydown.flickable', function() {
                    self.deactivate();
                }).bind('touchend.flickable mouseup.flickable mouseleave.flickable keyup.flickable', function() {
                    self.activate();
                });

                // Save original style
                element.data('style.flickable', element.attr('style'));

                // Copy styles onto content to keep layouts
                $.each(this.layoutStyles, function(i, prop) {
                    var style = element.css(prop);

                    self.content.css(prop, style);

                    if (prop === 'background-color') {
                        self.wrapper.css(prop, $.inArray(style, ['transparent', 'rgba(0, 0, 0, 0)']) >= 0 ? '#FFF' : style);
                    } else if (prop === 'width') {
                        element.css(prop, 'auto');
                    } else if (/^(padding-\w+|margin-\w+|border-\w+-width)$/.test(prop)) {
                        element.css(prop, 0);
                    } else if (/^(background-image|border-\w+-style)$/.test(prop)) {
                        element.css(prop, 'none');
                    }
                });

//T.K この処理が 1.7.xで動作するならこのままでよい
//                if ($.nodeName(element.get(0), 'body')) {
                if ($.nodeName(element[0], 'body')) {
                    this.box.bind('resize.flickable', function() {
                        setTimeout(function() {
                            !self.options.disabled && self.refresh();
                        }, 0);
                    });
                } else {
                    if (element.css('position') === 'static') {
                        // Fix overflow bugs in IE
                        element.css('position', 'relative');
                    }
                }

                $(window).bind('unload.flickable', function() {
                    self.disable();
                });

            }

            this.option(this.options);
            this.activate();
        },

        option: function(key, value) {
            var self = this, options = key;

            if (arguments.length === 0) {
                return $.extend({}, this.options);
            }

            if (typeof key === "string") {
                if (value === undefined) {
                    return this.options[key];
                }
                options = {};
                options[key] = value;
            }

            $.each(options, function(key, value) {
                self.setOption(key, value);
            });

            return this;
        },

        setOption: function(key, value) {
            var self = this,
                refresh = false;

            this.options[key] = value;

            switch (key) {
                case 'cancel':
                    this.cancel && this.cancel.removeClass('ui-flickable-canceled').unbind('.flickable');

                    // Add elements that has scroll
                    this.cancel = $('div', this.content).map(function(i, elem) {
                        return hasScroll(elem) ? elem : null;
                    }).add($('iframe,textarea,select', this.content));

                    if (value) {
                        this.cancel = this.cancel.add($(value, this.content));
                    }

                    this.cancel.addClass('ui-flickable-canceled').bind('touchstart.flickable mouseenter.flickable', function() {
                        self.canceled = true;
                    }).bind('touchend.flickable mouseleave.flickable', function() {
                        self.canceled = false;
                    });
                    break;
                case 'disabled':
//T.K この処理が 1.7.xで動作するならこのままでよい
//                    if( value )
//                    {
//                        this.element.addClass('ui-flickable-disabled');
//                    }
//                    else
//                    {
//                        this.element.removeClass('ui-flickable-disabled');
//                        this.selected   = undefined;
//                    }
                    this.element[value ? 'addClass' : 'removeClass']('ui-flickable-disabled');
                    if (!value) {
                        this.selected = undefined;
                    }
                    refresh = true;
                    this.noPadding = value;
                    break;
                case 'section':
                    this.sectionValue   = null;
                    this.sections = null;
                    if (value) {
                        this.sectionValue   = value;
                        this.sections = $(value, this.content);
                        refresh = true;
                    }
                    break;
            }
            refresh && this.refresh();
            return this;
        },

        destroy: function() {
            var self = this, scripts;

            this.noPadding = true;
            this.refresh();

            this.element
                .attr('style', this.element.data('style.flickable') || null)
                .removeClass('ui-flickable ui-flickable-disabled')
                .removeData('style.flickable');
            this.elementWrapper.unbind('.flickable');
            this.box.unbind('.flickable');
            this.cancel.unbind('.flickable').removeClass('ui-flickable-canceled');
            $(window).unbind('.flickable');

            scripts = script(this.content).attr('type', 'text/plain');

            this.content.add(this.wrapper).add(this.container)
                .replaceWith(this.content.children());
            scripts.attr('type', 'text/javascript');

            this.container = this.content = this.wrapper = this.cancel = this.selected = undefined;

            return this;
        },

        enable: function() {
            return this.setOption('disabled', false);
        },

        disable: function() {
            return this.setOption('disabled', true);
        },

        trigger: function(type, event, data) {
            var callback = this.options[type];

            event = $.Event(event);
            event.type = (type === 'flick' ? type : 'flick' + type).toLowerCase();
            data = data || {};

            if (event.originalEvent) {
                for (var i = $.event.props.length, prop; i;) {
                    prop = $.event.props[--i];
                    event[prop] = event.originalEvent[prop];
                }
            }

//T.K bugfix event > event.type
            this.originalElement.trigger(event.type, data);

            return !(callback && callback.call(this.element[0], event, data) === false ||
                event.isDefaultPrevented());
        },

        refresh: function() {
            var self = this,
                scroll = {x:0, y:0},
                width, wrapperPosition,
                maxWidth, maxHeight,
                content = this.content,
                padding = this.padding,
                _padding = $.extend({}, padding),
                clientElement = document.compatMode === 'CSS1Compat' ? this.elementWrapper : this.element,
                box = {};

//T.K sectionの親(デフォルトならばul)の横幅を動的に指定する場合。ただしsection指定が前提となる。
//T.K 親(デフォルトならばul)の横幅を動的に指定するメリットは、動的にセクション(デフォルトならばui)を追加するけどセクションを改行したくない場合に有効
            if( this.sections && this.sections.length > 0 && this.options.isDynamicWidth )
            {
                var section     = $(this.sections[0]);
                var parentElem  = section.parent();
                var parentWidth = this.sections.length * section.prop('scrollWidth');
                parentElem.width(parentWidth);

                content.width(parentWidth);
                this.container.width(parentWidth);
            }

            width = content.width();
            content.width('auto');

//T.K jquery1.7.x対応
            maxHeight = this.elementWrapper.prop('scrollHeight') - (_padding.height || 0) * 2;
            maxWidth = this.elementWrapper.prop('scrollWidth') - (_padding.width || 0) * 2;

            if (width > maxWidth) {
                content.width(width);
                maxWidth = content.outerWidth() + parseInt(content.css('margin-left')) + parseInt(content.css('margin-right'));
            }

            $.each({'Height':maxHeight, 'Width':maxWidth}, function(dimension, max) {
                var _dimension = dimension.toLowerCase();

                box[_dimension] = self.box[_dimension]();

                // Attach paddings if element has scroll
//T.K jquery1.7.x対応
                padding[_dimension] = max > clientElement.prop('client' + dimension) && !self.noPadding ?
                    Math.round(box[_dimension] / 2) : 0;
            });

            this.container.width(box.width >= maxWidth ? 'auto' : maxWidth).css({
                'padding-top': padding.height,
                'padding-bottom': padding.height,
                'padding-left': padding.width,
                'padding-right': padding.width
            });
            maxWidth = box.width > maxWidth ? box.width : maxWidth;

//T.K jquery1.7.x対応
            this.hasScroll.x = this.elementWrapper.prop('scrollWidth') > clientElement.prop('clientWidth');
            this.hasScroll.y = this.elementWrapper.prop('scrollHeight') > clientElement.prop('clientHeight');

            wrapperPosition = this.position(this.wrapper);

            this.stretchPosition = {
                top: wrapperPosition.top,
//T.K jquery1.7.x対応
                bottom: wrapperPosition.top + maxHeight - clientElement.prop('clientHeight'),
                left: wrapperPosition.left,
//T.K jquery1.7.x対応
                right: wrapperPosition.left + maxWidth - clientElement.prop('clientWidth')
            };

            this.sectionPostions = this.sections ? this.sections.map(function() {
                return self.position(this);
            }).get() : [];

            $.each({x:'width', y:'height'}, function(axis, dimension) {
                scroll[axis] = padding[dimension] - (_padding[dimension] || 0);
            });

            this.scroll(scroll.x, scroll.y);

            return this;
        },

        scroll: function(x, y) {
            var box = this.box;

            x && box.scrollLeft(box.scrollLeft() + x);
            y && box.scrollTop(box.scrollTop() + y);

            return this;
        },

        scrollWindow: function(x, y) {
            this.box[0].scrollBy(parseInt(x), parseInt(y));

            return this;
        },

        position: function(elem) {
            var offset1 = $(elem).offset(),
                offset2 = this.element.offset();

            return {
                top:  Math.floor(offset1.top  - offset2.top  + this.box.scrollTop()),
                left: Math.floor(offset1.left - offset2.left + this.box.scrollLeft())
            };
        },

        positionWindow: function(elem) {
            var offset = $(elem).offset();

            return {
                top:  Math.floor(offset.top),
                left: Math.floor(offset.left)
            };
        },

        activate: function() {
            this.scrollBack();
            return this;
        },

        deactivate: function() {
            if (this.isScrolling()) {
                this.preventDefaultClick = true;
            }

            this.remainder.x = 0;
            this.remainder.y = 0;
            this.inertialVelocity.x = 0;
            this.inertialVelocity.y = 0;

            // !this.options.disabled && this.refresh();
            clearInterval(this.inertia);
            clearInterval(this.back);

            return this;
        },

        clickHandler: function(event) {
            if (this.preventDefaultClick) {
                event.preventDefault();
                this.preventDefaultClick = false;
            }
        },

        dragStart: function(event) {
            var self = this,
                e = event.type === 'touchstart' ? event.originalEvent.touches[0] : event;

            if (event.type === 'touchstart' && event.originalEvent.touches.length > 1) {
                return;
            }

            if (!this.canceled && !this.options.disabled) {
                this.timeStamp = event.timeStamp;
                $.each(['x', 'y'], function(i, axis) {
                    self.client[axis] = e['client' + axis.toUpperCase()];
                    self.inertialVelocity[axis] = 0;
                });

                if (this.trigger('dragStart', event) === false) return false;

                this.container.unbind('touchstart.flickable mousedown.flickable')
                    .bind('touchmove.flickable mousemove.flickable', function(event) {
                        return self.drag(event);
                    }).bind('touchend.flickable mouseup.flickable mouseleave.flickable', function(event) {
                        return self.dragStop(event);
                    });

                if (!(event.type === 'touchstart' ? specialNodesForTouch : specialNodes).test(event.target.nodeName.toLowerCase())) {
                    event.preventDefault();
                }
            }
        },

        drag: function(event) {
            var self = this, velocity = {},
                t = event.timeStamp - this.timeStamp,
                e = event.type === 'touchmove' ? event.originalEvent.touches[0] : event;

            if (event.type === 'touchmove' && event.originalEvent.touches.length > 1) {
                return;
            }

            if (this.trigger('drag', event) === false) return false;

            $.each(['x', 'y'], function(i, axis) {
                var client = e['client' + axis.toUpperCase()];

                velocity[axis] = self.hasScroll[axis] && (!self.draggableAxis || self.draggableAxis === axis)
                    ? self.client[axis] - client : 0;
                self.client[axis] = client;

                if (t) self.inertialVelocity[axis] = velocity[axis] / t;
            });

            if (this.sections && !this.draggableAxis) {
                this.draggableAxis = Math.abs(velocity.x) > Math.abs(velocity.y) ? 'x' : 'y';
                velocity[this.draggableAxis === 'x' ? 'y' : 'x'] = 0;
            }

            this.timeStamp = event.timeStamp;
            velocity = this.velocity(velocity);

            this.scroll(velocity.x, velocity.y);
            
            if (!specialNodes.test(event.target.nodeName.toLowerCase())) {
                event.preventDefault();
            }
            this.preventDefaultClick = true;
        },

        dragStop: function(event) {
            var self = this;

            if (event.type === 'touchend' && event.originalEvent.touches.length > 1) {
                return;
            }

            if (this.trigger('dragStop', event) === false) return false;

            this.container.unbind('.flickable')
                .bind('touchstart.flickable mousedown.flickable', function(event) {
                    return self.dragStart(event);
                }).bind('click.flickable', function(event) {
                    return self.clickHandler(event);
                });

            this.flick();
        },

        flick: function() {
            var self = this,
                options = this.options,
                box = this.box,
                inertialVelocity = this.inertialVelocity,
                friction = options.friction;

            // Make sure that the method is executed only once
            clearInterval(this.inertia);

            $.each(inertialVelocity, function(axis, velocity) {
                if (Math.abs(velocity) < 0.1) inertialVelocity[axis] = 0;
            });

            if (this.sections) {
                var destination, distance, axis;

                if (this.isScrolling()) {
                    var distances, nearest, scrollPos, posName, scroll,
                        scrollTop = box.scrollTop(),
                        scrollLeft = box.scrollLeft();

                    if (Math.abs(inertialVelocity.x) > Math.abs(inertialVelocity.y)) {
                        axis = 'x';
                        posName = 'left';
                        scroll = 'scrollLeft';
                        scrollPos = scrollLeft;
                        inertialVelocity.y = 0;
                    } else {
                        axis = 'y';
                        posName = 'top';
                        scroll = 'scrollTop';
                        scrollPos = scrollTop;
                        inertialVelocity.x = 0;
                    }

                    distances = $.map(this.sectionPostions, function(position) {
                        if ((inertialVelocity[axis] > 0 && position[posName] > scrollPos) ||
                            (inertialVelocity[axis] < 0 && position[posName] < scrollPos)) {
                            return Math.abs(position.top - scrollTop) + Math.abs(position.left - scrollLeft);
                        }
                        return Infinity;
                    });

                    nearest = Math.min.apply(Math, distances);

                    if (nearest !== Infinity) {
                        destination = this.sectionPostions[$.inArray(nearest, distances)][posName];
                        distance = destination - scrollPos;
                        friction = false;
                    }
                }
            }

            inertialVelocity.x *= 13;
            inertialVelocity.y *= 13;

            this.inertia = setInterval(function() {
                if (options.disabled || !self.isScrolling() || self.trigger('flick') === false) {
                    inertialVelocity.x = 0;
                    inertialVelocity.y = 0;
                    clearInterval(self.inertia);
                    self.scrollBack();
                    return;
                }

                if (destination !== undefined) {
                    var scrollPos = box[scroll]();

                    if ((distance > 0 && scrollPos > destination) ||
                        (distance < 0 && scrollPos < destination)) {
                        // Do scrollback when position pass over the destination
                        inertialVelocity[axis] = 0;
                    } else {
                        inertialVelocity[axis] = options.elasticConstant / 4 * distance;
                    }
                }

                $.extend(inertialVelocity, self.velocity(inertialVelocity, friction));

                self.scroll(inertialVelocity.x, inertialVelocity.y);
            }, 13);

            return this;
        },

        scrollBack: function() {
            var self = this,
                options = this.options,
                inertialVelocity = this.inertialVelocity,
                cancel = false;

            clearInterval(this.back);

            this.back = setInterval(function() {
                if (options.disabled || (inertialVelocity.x && inertialVelocity.y)) return;

                var velocity = {},
                    extension = {};

                if (self.sections) {
                    var pos, distances, index, selected,
                        scrollTop = self.box.scrollTop(),
                        scrollLeft = self.box.scrollLeft();

                    // Calculate distances between sections and scroll position
                    distances = $.map(self.sectionPostions, function(position) {
                         return Math.abs(position.top - scrollTop) + Math.abs(position.left - scrollLeft);
                    });

                    index = $.inArray(Math.min.apply(Math, distances), distances);
                    pos = self.sectionPostions[index];

                    extension = {
                        x: self.hasScroll.x ? scrollLeft - pos.left : 0,
                        y: self.hasScroll.y ? scrollTop - pos.top : 0
                    };

                    if (!extension.x && !extension.y && !self.isScrolling()) {
                        selected = self.sections.eq(index);
                    }
                } else {
                    extension = self.stretch();
                }

                $.each(inertialVelocity, function(axis, v) {
                    // Don't scroll when inertia scroll is active
                    velocity[axis] = v ? 0 : -1 * options.elasticConstant * extension[axis];
                });

                velocity = self.velocity(velocity, false);
                if (velocity.x || velocity.y) {
                    cancel = self.trigger('scrollBack') === false;
                }

                if ((!extension.x && !extension.y) || cancel) {

                    if (selected) {
                        // Reset draggable axis
                        self.draggableAxis = undefined;

                        if (!self.selected || self.selected[0] != selected[0]) {
                            var data = {
                                newSection: selected,
                                oldSection: self.selected
                            };

//T.K 選択中のフリック要素を指すインデックス
                            self.selectedIndex  = index;
                            self.selected = $(selected[0]);

//T.K 追加処理s
//                            self.trigger('change', null, data);
                            if(! self.isSectionReseting )
                            {
                                //セクションリセット処理中はchangeイベントを発火させない ＞ sectionaddイベントが実行されるため
                                self.trigger('change', null, data);         //変わったことを表すchangeイベントを実行
                            }

                            self._addSectionCheck();
//T.K 追加処理e
                        }
                    }

                    clearInterval(self.back);
                    return;
                }

                self.scroll(velocity.x, velocity.y);
            }, 13);

            return this;
        },

        select: function(index) {
            var self = this,
                box = this.box,
                scrollLeft = box.scrollLeft(),
                scrollTop = box.scrollTop(),
                inertialVelocity = this.inertialVelocity,
                destination, distance;

            clearInterval(this.back);
            clearInterval(this.inertia);

            destination = this.sectionPostions[index];
            distance = {
                x: destination.left - scrollLeft,
                y: destination.top - scrollTop
            }

            this.inertia = setInterval(function() {
                $.each({x:'Left', y:'Top'}, function(axis, posName) {
                    var scrollPos = box['scroll' + posName]();
                    posName = posName.toLowerCase();

                    if ((distance[axis] > 0 && scrollPos > destination[posName]) ||
                        (distance[axis] < 0 && scrollPos < destination[posName])) {
                        inertialVelocity[axis] = 0;
                    } else {
                        inertialVelocity[axis] = self.options.elasticConstant / 4 * distance[axis];
                    }
                });

//T.K bugfix http://lagoscript.org/jquery/flickable comment Dec 02,2001 17:55 WKOIJIさんの指摘
                $.extend(inertialVelocity, self.velocity(inertialVelocity, false));

                if (self.options.disabled || !self.isScrolling()) {
                    clearInterval(self.inertia);
                    self.scrollBack();
                    return;
                }

//T.K bugfix http://lagoscript.org/jquery/flickable comment Dec 02,2001 17:55 WKOIJIさんの指摘
//                $.extend(inertialVelocity, self.velocity(inertialVelocity, false));

                self.scroll(inertialVelocity.x, inertialVelocity.y);
            }, 13);

            return this;
        },

        stretch: function() {
            var self = this,
                stretch = {x: 0, y: 0},
                stretchPosition = this.stretchPosition;

            $.each({x:['left', 'right', 'Left'], y:['top', 'bottom', 'Top']}, function(axis, posNames) {
                var scrollPos;

                if (!self.hasScroll[axis]) return;

                scrollPos = self.box['scroll' + posNames[2]]();

                if (scrollPos < stretchPosition[posNames[0]]) {
                    stretch[axis] = scrollPos - stretchPosition[posNames[0]];
                } else if (scrollPos > stretchPosition[posNames[1]]) {
                    stretch[axis] = scrollPos - stretchPosition[posNames[1]];
                }
            });

            // Stretch can be negative
            return stretch;
        },

        velocity: function(velocity, friction) {
            var self = this, f = {}, _velocity = {};

            if (friction !== false) {
                f = this.friction(friction);
            }

            $.each(velocity, function(axis, v) {
                v += self.remainder[axis] || 0;

                if (f[axis] !== undefined) {
                    v *= f[axis];
                }

                // Make sure that the velocity is integer
                _velocity[axis] = Math.round(v);

                // Save remainders to calculate precise velocity for next method call
                self.remainder[axis] = v - _velocity[axis];
            });

            return _velocity;
        },

        friction: function(_default) {
            var self = this, f = {},
                stretch = this.stretch();

            if (_default === undefined) _default = 1;

            $.each({x:'width', y:'height'}, function(axis, dimension) {
                f[axis] = _default;

                if (stretch[axis]) {
                    var padding = self.padding[dimension];
                    f[axis] *= (padding - Math.abs(stretch[axis])) / padding;
                }
            });

            return f;
        },

        isScrolling: function() {
            return this.inertialVelocity.x || this.inertialVelocity.y;
        },

//T.K 追加メソッドs
        //セクションのリセットする。自身の持つセクションをリセット（セクションを削除し、引数の情報で再作成）する
        resetSection: function( data, event )
        {
            //フリック無効または、セクション管理クラス名がないまたは、セクションクラス名がないまたは、テンプレートセクションクラス名が無いならば何もしない
            //リセット処理はセクションロード中でも実行可能
            if( this.options.disabled || !data.sectionManagerClassSelecter || !data.jqTemplateName)
            {
                return false;
            }

            //セクションリセット開始イベント発火
            this.trigger('beforesectionreset', event, data.eventParam);

            this.isSectionReseting        = true;
            this.selectedIndex          = 0;
            this.sectionManagerClassSelecter  = data.sectionManagerClassSelecter;
            this.jqTemplateName         = data.jqTemplateName;
            this.sectionIdPrev            = null;
            this.sectionIdNext            = null;

            //セクションを全削除 セクションの数が変動するのでflickable関連要素の位置やサイズなどを再計算
            this.sections.remove();
            this.setOption('section', this.sectionValue);

            //セクションを追加
            var sectionId     = this._addSection( 'append', data.eventParam.sequenceNo );

            //カレントのセクションに移動
            this.select( this.selectedIndex );

            //セクションリセットイベント発火
            var eventParam  = $.extend(true, {}, data.eventParam, {sectionId : sectionId, addType : 'current', isResetProcess : true});
            this.trigger('sectionreset', event, eventParam);

            return true;
        },

        //セクションの追加チェック(privateメソッド)
        //現時点での先端、末端セクションがカレントになった時、続きのセクションが生成可能かチェックする
        _addSectionCheck : function()
        {
            //フリック無効または、セクションロード中ならば何もしない
            if( this.options.disabled || this.isSectionLoading )
            {
                return;
            }

            //最後のセクションならば。かつ、this.sectionIdNextが値を持つならば。
            if( (this.sections.length - 1) === this.selectedIndex && this.sectionIdNext )
            {
                var sectionId     = this._addSection( 'append', this.sectionIdNext );

                //セクション追加イベントの発火
                this.trigger('sectionadd', null, {sectionId : sectionId, addType : 'next', sequenceNo : this.sectionIdNext, isResetProcess : false });
            }

            //最初のセクション。かつ、this.sectionIdPrevが値を持つならば。
            else if( this.selectedIndex === 0 && this.sectionIdPrev )
            {
                var sectionId     = this._addSection( 'prepend', this.sectionIdPrev );

                //セクション追加イベントの発火
                this.trigger('sectionadd', null, {sectionId : sectionId, addType : 'prev', sequenceNo : this.sectionIdPrev, isResetProcess : false });
            }

            this.trigger('sectionchecked');
        },

        //セクションの追加(privateメソッド。ここでの処理はセクションを追加するだけ。セクションの中身はイベントハンドラ側に任せる）
        _addSection : function( addSectionPosition, sequenceNo )
        {
            //セクションに使うidを生成
            var sectionId     = this._createSectionId();

            //セクションテンプレートのクローンを作成。これを新たなセクションとして追加する
            var newSection    = $.tmpl(this.jqTemplateName, {'sectionId' : sectionId, 'sequenceNo' : sequenceNo});

            if( addSectionPosition == 'append' )
            {
                $(this.sectionManagerClassSelecter, this.content).append(newSection);

                //セクションの数が変動したのでflickable関連要素の位置やサイズなどを再計算
                this.setOption('section', this.sectionValue);
            }
            else
            {
                $(this.sectionManagerClassSelecter, this.content).prepend(newSection);

                //セクションの数が変動したのでflickable関連要素の位置やサイズなどを再計算
                this.setOption('section', this.sectionValue);

                this.selectedIndex  = 1;    //先頭にセクションを追加したので、整合性を保つために位置を1つずらす（0から1へ）

                //ターゲットエレメント（ページ全体の場合はwindowのjQueryオブジェクト）の位置を移動する ---start---

                //scrollBack関数内で少しずつ行っている処理をここでは一気に移動させている
                destination     = this.sectionPostions[this.selectedIndex];      //ターゲットセクションのポジションを格納する
                distance    = {
                    //ターゲットセクションのboxの基点（左上）からの距離を計算する
                    x: destination.left - this.box.scrollLeft(),
                    y: destination.top - this.box.scrollTop()
                }
                //this.select( this.selectedIndex );              //選択中のセクションを再計算後の位置に移動
                this.scroll(distance.x, distance.y);
                var selected    = this.sections.eq(this.selectedIndex);
                this.selected   = $(selected[0]);       //選択中のフリックセクションを格納する（ここが唯一の設定箇所っぽい）
                //ターゲットエレメント（ページ全体の場合はwindowのjQueryオブジェクト）の位置を移動する ---end---
            }

            return sectionId;
        },

        //対象のセクションオブジェクトがカレントセクションか？
        isCurrentSection: function( sectionObj )
        {
            return (this.sections.eq(this.selectedIndex))[0] === $(sectionObj)[0] ? true : false;
        },

        //セクションIDを生成する
        _createSectionId: function(){
            return 'sectionId-' + new Date().getTime();
        },

        //セクションの読込を開始する
        beginSectionLoad: function() {
            this.isSectionLoading     = true;
        },

        //セクションの読込を終了する
        endSectionLoad: function() {
            this.isSectionLoading     = false;
            this.isSectionReseting    = false;
            this._addSectionCheck();  //セクションローディング中に先端、末端までセクションをフリックしているかもしれないのでチェックする
        },

        //対象セクションオブジェクトの前セクションIDを設定する
        setPrevSectionId : function( prevId )
        {
            this.sectionIdPrev    = prevId;
        },

        //対象セクションオブジェクトの次セクションIDを設定する
        setNextSectionId : function( nextId )
        {
            this.sectionIdNext    = nextId;
        },

        //セクションリセット処理中か？
        isSectionReset: function() {
            return this.isSectionReseting;
        }
//T.K 追加メソッドe
    };

    flickable.prototype.create.prototype = flickable.prototype;

    function hasScroll(elem) {
        elem = $(elem);

        if ($.inArray(elem.css('overflow'), ['scroll', 'auto']) >= 0) {
//T.K jquery1.7.x対応
            return elem.prop('scrollWidth') > elem.prop('clientWidth') ||
                elem.prop('scrollHeight') > elem.prop('clientHeight');
        }
        return false;
    }

    function script(elem) {
        return $('script', elem).map(function(i, script) {
            var type = $(script).attr('type');
            return !type || type.toLowerCase() === 'text/javascript' ? script : null;
        });
    }

})(jQuery, window, Math);

