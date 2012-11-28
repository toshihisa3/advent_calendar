Advent Calendar Blog Material
=============

##アドベントカンレンダーで紹介したflikableのファイル一式です

利用しているプラグイン
-------

* [jQuery1.7.2](http://jquery.com/) -- jQueryの本体です
* [jQuery Templates](http://api.jquery.com/category/plugins/templates/) -- ベータ版です。現在は開発がストップしています。今後新しいテンプレートにリプレースされるようです
* [jQuery.flickable](http://lagoscript.org/jquery/flickable) -- 今回の主役です。フリックスクロールを可能にします

利用方法
------------

基本的な使い方は[こちら](http://lagoscript.org/jquery/flickable/documentation)を参照。


### 追加した機能の説明
#### flickableコンストラクタ
パラメータを追加する

+   'isDynamicWidth' :
    フリック領域の横幅を動的に変える場合はtrue。固定するならばfalse(デフォルト)。セクションを動的に追加する場合、同時にセクションを追加する要素の横幅を広げないと改行されてしまうための措置。改行されても良い場合はfalseを指定する。

### 追加したメソッド

#### resetSectionメソッド
動的にセクションを生成するきっかけとなるメソッド。
コールすると現在のセクションを全て削除し、新たなセクションを生成する。

パラメータとしてオブジェクト形式で以下のプロパティを渡す

+   'sectionManagerClassSelecter' :
    セクションのルートとなる要素を指定する

+   'jqTemplateName' :
    jquery templateのtemplate名を指定する。ここで指定したテンプレートを使ってセクションのスケルトンを生成し、sectionManagerClassSelecterで指定した要素配下に追加する。また、このテンプレートには以下の２つのプロパティが渡される
    +   'sectionId' :
        追加したセクション要素のid属性値

    +   'sequenceNo' :
        サーバーがセクション要素に表示する情報を一意に特定できる値（resetSectionコール時の引数sequenceNoまたは、setNextSectionIdコール時、setPrevSectionIdコール時に設定した値を使用する）


+   'eventParam' :
    beforesectionresetイベント、sectionresetイベントに引き渡されるオブジェクト。渡したい情報をプロパティとして定義する。
    sectionresetイベントには以下のプロパティが別途追加される
    +   'sectionId' :
        追加したセクション要素のid属性値

    +   'addType' :
        追加したセクションがカレント、次セクション、前セクションのいずれか。

    +   'isResetProcess' :
        resetSectionをコールして生成したセクションならばtrue。連動して生成する前後のセクションならばfalse。


#### beginSectionLoadメソッド
セクションの読込を開始フラグを立てる。
フラグが立っている間はセクションが追加できない。

#### endSectionLoadメソッド
セクションの読込を開始フラグを降ろす。

#### isSectionResetメソッド
リセット処理中ならばtrue。違うならばfalse。
リセット処理中はflickchangeイベントが発生しない。

#### setNextSectionIdメソッド
対象セクションオブジェクトの次セクションIDを設定する
サーバーがセクション要素に表示する情報を一意に特定できる値を設定する

#### setPrevSectionIdメソッド
対象セクションオブジェクトの前セクションIDを設定する
サーバーがセクション要素に表示する情報を一意に特定できる値を設定する

#### isCurrentSectionメソッド
対象のセクションオブジェクトがカレントセクションならばtrue。違うならばfalse。



### 追加したイベント

#### flickbeforesectionresetイベント
セクションリセット前処理イベント
resetSectionメソッドがコールされた時、セクションのリセット処理が実行される直前に発生するイベント
通信中のajax処理の中断処理など、現在のセクションを削除する前にやっておきたい処理を記述する

#### flicksectionresetイベント
セクションリセットイベント。resetSectionメソッドがコールされた時、flickbeforesectionresetイベントの後に発生するイベント。具体的には以下のフローとなる。
1. flickbeforesectionresetイベント発生
2. 現在のセクションを削除
3. セクションのスケルトンを新規に追加
4. flicksectionresetイベント発生
このイベントでは新規に生成したセクションの内容を構築する処理を記述する

#### flicksectionaddイベント
セクション追加イベント。カレントセクションが現時点で存在するセクションの先頭セクションまたは、末尾セクションだった時に、続きのセクションが存在する時に発生するイベント。具体的には以下の2つのフローがある。
##### パターン１
1. endSectionLoadメソッドがコールされる
2. 自身が先頭セクションまたは、末尾セクションで、なおかつ続きのセクション情報があるなら3.へ進む
3. セクションのスケルトンを新規に追加
4. flicksectionaddイベント発生

##### パターン２
1. flickchangeイベント発生（isSectionResetメソッドがtrueでflickchangeイベントが発生しなくても本処理は行われる）
2. 自身が先頭セクションまたは、末尾セクションで、なおかつ続きのセクション情報があるなら3.へ進む
3. セクションのスケルトンを新規に追加
4. flicksectionaddイベント発生

このイベントでは新規に生成したセクションの内容を構築する処理を記述する。また、このイベントにはプラグイン内で以下のプロパティを持つオブジェクト生成して渡している

+   'sectionId' :
    追加したセクション要素のid属性値

+   'sequenceNo' :
    追加したセクション要素に表示する情報を一意に特定する値（resetSectionコール時の引数sequenceNoまたは、setNextSectionIdコール時、setPrevSectionIdコール時に設定した値を使用する）

+   'addType' :
    追加したセクションがカレント、次セクション、前セクションのいずれか。

+   'isResetProcess' :
    resetSectionをコールして生成したセクションならばtrue。芋づる的に生成する前後のセクションならばfalse。
