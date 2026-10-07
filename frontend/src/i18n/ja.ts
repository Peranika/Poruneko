// Japanese string table. Values are inserted into {name}.
// String tables of other languages (en.ts etc.) have the same shape (enforced by the type).

export const ja = {
  common: {
    loading: '読み込み中…',
    cancel: 'キャンセル',
    save: '保存',
    close: '閉じる',
    retry: '再試行',
    all: 'すべて',
    none: 'なし',
    unknown: '不明',
    items: '{n} 件',
    works: '{n} 作品',
    pages: '{n} ページ',
    circle: 'サークル',
    artist: '作者',
    title: 'タイトル',
    series: 'シリーズ',
    edit: '編集',
    needsReview: '要確認',
    showFolder: '保存先を表示',
    listSeparator: '、',
    parens: '（{text}）',
    rangeSeparator: '〜'
  },

  app: {
    downloadingNow: 'ダウンロード中',
    back: '戻る (Alt+←)',
    backShort: '戻る',
    forward: '進む (Alt+→)',
    minimize: '最小化',
    maximize: '最大化',
    bookmarks: 'ブックマーク',
    siteList: '一覧',
    favorites: 'お気に入り',
    history: '履歴',
    historyTitle: 'ビューアで開いた作品の履歴',
    settings: '設定'
  },

  labels: {
    siteSource: '作品の情報',
    titleSource: 'タイトル',
    manualSource: '手動',
    siteArtist: 'アーティスト',
    siteGroup: 'グループ',
  },

  /** Work info (list rows and the gallery page) */
  meta: {
    creator: '作者情報',
    artists: 'アーティスト',
    groups: 'グループ',
    parodies: 'シリーズ',
    characters: 'キャラ',
    language: '言語',
    pages: 'ページ',
    date: '投稿日'
  },

  bookmarkList: {
    sorts: {
      added: '追加日順',
      title: 'タイトル順',
      artist: 'アーティスト名順',
      circle: 'サークル名順'
    },
    special: {
      all: 'すべて',
      review: '要確認',
      pending: '検索中',
      downloading: 'ダウンロード中',
      none: '不明'
    },
    nameKinds: {
      circle: 'サークル',
      artist: '作者',
      siteGroup: 'サイトのグループ',
      siteArtist: 'サイトのアーティスト'
    }
  },

  bookmarks: {
    openNameIn: '{name} を「{view}」で開く',
    fromUrl: 'URL から追加',
    fromUrlTitle: 'クリップボードにある作品の URL をブックマークします（この画面で Ctrl+V で貼り付けても追加できます）',
    fromUrlPrompt: 'ブックマークする作品の URL',
    fromUrlAlready: '既にブックマークしています',
    byCircleToggle: 'サークル別（もう一度押すと作者別）',
    byArtistToggle: '作者別（もう一度押すとサークル別）',
    shuffle: 'シャッフル再生',
    avoidRecent: '最近開いた作品を出にくくする',
    avoidRecentTitle: '履歴で最近開いた作品ほど、シャッフルの順番で後ろに来やすくします（3 日ほどで元に戻ります）',
    shuffleTitle: '表示中の作品をランダムな順番で開きます（「次の作品」もその順番。シリーズはまとめて順番どおりに）',
    localTagsToggle: 'ローカルタグで絞り込む（もう一度押すと作品のタグ）',
    workTagsToggle: '作品のタグで絞り込む（もう一度押すとローカルタグ）',
    workTags: 'タグ',
    workTagsFilter: 'タグを絞り込む',
    noSiteNames: '該当するタグがありません',
    seriesTitle: 'シリーズ（連番作品などのまとまり）',
    searchPlaceholder: '作者・サークル・タイトルで検索 (Ctrl+F)',
    stopSearch: '検索をやめる (Esc)',
    matchingNames: '一致する名前',
    noMatchingNames: 'ありません',
    searchByName: '「{name}」で検索',
    searchResults: '「{query}」の検索結果',
    empty: 'ブックマークはまだありません',
    emptyHint: '一覧や作品ページの {icon} から追加できます',
    noResults: '「{query}」に一致するブックマークはありません',
    showName: '{kind}「{name}」のブックマークを表示'
  },

  /** The user's own tags */
  tags: {
    title: 'ローカルタグ',
    add: 'ローカルタグを付ける',
    addToSeries: 'シリーズ内の全作品にローカルタグを付ける',
    seriesHint: 'シリーズ内の {n} 作品すべてに付けます（全作品に共通するローカルタグを表示）',
    addPlaceholder: 'ローカルタグを追加（Enter・カンマで区切る）',
    remove: '外す',
    filterTitle: 'このローカルタグで絞り込む（複数選ぶと、すべてが付いた作品）',
    untagged: 'ローカルタグなし',
    rename: 'ローカルタグの名前を変える（付いている全作品で）',
    renamePrompt: '「{tag}」の新しい名前（同じ名前のローカルタグがあればまとめます）',
    renamed: '「{from}」を「{to}」に変えました（{n} 作品）',
    noTags: 'ローカルタグはまだありません（作品ページやカードの + から付けられます）',
    showTag: 'ローカルタグ「{tag}」の作品を表示',
    hint: '自分で付ける絞り込み用のタグです。ブックマークやローカルのフォルダの画面で絞り込めます'
  },

  bookmarkCard: {
    editCreator: '作者情報を編集',
    seriesOf: 'シリーズ: {name}（変更・外す）',
    addToSeries: 'シリーズに入れる',
    deleteFiles: 'ダウンロードした cbz を削除',
    unbookmark: 'ブックマーク解除',
    unbookmarkConfirm: 'ブックマークを解除しますか？',
    resolving: '作者情報を検索中…',
    seriesChip: 'シリーズ「{name}」の {no} 番目',
    uncertain: '作者情報が不確かです。クリックで確認',
    uncertainShort: '作者情報が不確かです（カーソルを乗せると出る黄色のボタンで確認）',
    actions: {
      retryRange: '再試行（取得済みのページはそのまま、足りないページだけ取る）',
      buildRange: 'ダウンロードして cbz にする',
      pause: '一時停止',
      download: 'ダウンロード'
    }
  },

  bookmarkActions: {
    deleteRangeConfirm: 'cbz を削除しますか？\nブックマークは残り、元の作品のページを表示するようになります。',
    deleteConfirm: 'ダウンロード済みの cbz を削除しますか？',
    unbookmarkRangeConfirm: 'ブックマークを解除しますか？\nページ範囲から作った cbz も削除されます。'
  },

  /** Download status badges */
  download: {
    done: '保存済',
    doneTitle: 'ダウンロード済み',
    downloading: 'ダウンロード中',
    queued: '待機中',
    error: 'エラー',
    paused: '一時停止',
    local: 'ローカル',
    localTitle: 'ページ範囲から作ったローカルの作品',
    link: 'リンク',
    linkTitle: 'ページ範囲のブックマーク（元の作品のページを表示）',
    withRetryHint: '{error}。「再試行」で続きから作成できます'
  },

  series: {
    noSeries: 'シリーズはまだありません',
    newSeries: '＋ 新しいシリーズ',
    create: '作る',
    open: 'シリーズ「{name}」を開く',
    inThisGroup: 'この分類に {n} 作品',
    sorts: {
      title: 'タイトル順',
      date: '投稿日順'
    },
    sortTitle: 'シリーズ内の順番を{sort}に並べ直す',
    sortButton: '{sort}に並べる',
    selectHint: '左の一覧からシリーズを選ぶか、新しいシリーズを作ってください',
    namePrompt: 'シリーズ名',
    deleteConfirm: 'シリーズ「{name}」を削除しますか？\n入っている作品のブックマークは残ります。',
    deleteFolderNote: 'フォルダから自動で作ったシリーズです。削除すると、このフォルダはもうシリーズになりません。',
    rename: 'シリーズ名を変更',
    delete: 'シリーズを削除',
    empty: 'このシリーズにはまだ作品がありません',
    emptyHint: 'ブックマークのカードや作品ページの {icon} から入れられます'
  },

  selection: {
    select: '選択（Ctrl+クリックで切り替え、Shift+クリックで範囲を選択）',
    count: '{n} 件選択中',
    hint: '選択中のカードのボタンは選択中の作品すべてに適用されます（Ctrl+クリックで追加、他の場所のクリックや Esc で解除）',
    selectAll: '表示中をすべて選択',
    clear: '選択を解除',
    appliesTo: '選択中の {n} 作品すべてに適用します',
    tagHint: '選択中の {n} 作品すべてに付けます（全作品に共通するローカルタグを表示）',
    unbookmarkConfirm: '選択中の {n} 作品のブックマークを解除しますか？',
    unbookmarked: '{n} 作品のブックマークを解除しました',
    deleteFilesConfirm: '選択中の {n} 作品のダウンロードしたファイルを削除しますか？',
    creatorSaved: '{n} 作品の作者情報を保存しました',
    addedToSeries: '{n} 作品を「{name}」に入れました'
  },

  seriesDialog: {
    title: 'シリーズ',
    created: 'シリーズ「{name}」を作りました',
    unchanged: 'シリーズは変わっていません',
    added: '「{name}」の {no} 番目に入れました',
    removed: '「{name}」から外しました',
    current: '今のシリーズ: {name}（{no} / {total}）',
    suggestions: '候補（タイトル・作者から）',
    filter: 'シリーズ名で絞り込む',
    noMatch: '一致するシリーズはありません',
    newSeries: '新しいシリーズ',
    namePlaceholder: 'シリーズ名',
    hint: '別のシリーズに入れると、今のシリーズからは外れます。シリーズ内の順番はブックマーク画面でドラッグして変えられます',
    remove: 'シリーズから外す',
    createAndAdd: '作って入れる',
    add: '入れる'
  },

  creator: {
    candidateSeparator: ' ／ ',
    saved: '作者情報を保存しました',
    title: '作者情報の確認',
    siteInfo: 'サイト: グループ {groups} ／ アーティスト {artists}',
    fillFromBookmarks: 'ブックマークの他の作品から:',
    fillTitle: '同じ名前の作品 {n} 件で使われています。押すと入力します',
    linked: '紐づけ:',
    unlink: '紐づけを外す',
    unlinkTitle: '作者名・サークル名はそのままで、作品ページとの紐づけだけを外します（違う作品に紐づいている時に）',
    unlinked: '紐づけを外しました',
    fromUrl: 'ページから読み込む',
    fromUrlTitle: '見つけた作品ページから作者名・サークル名を読み込みます（DLsite・FANZA 同人のみ）',
    fromUrlPlaceholder: 'DLsite・FANZA 同人の作品ページの URL',
    circlePlaceholder: 'サークル名',
    artistsPlaceholder: '作者名（複数はカンマ区切り）',
    searching: '検索中…',
    search: '候補を検索',
    webSearch: 'Web で探す',
    webSearchHint: 'タイトルや作者名でブラウザの Google 検索を開きます。見つけた作者名・サークル名は上の欄に入力して保存してください',
    siteFilter: '検索するサイト',
    siteNone: 'サイト指定なし',
    siteAll: '対応サイトすべて',
    googleTitle: 'タイトルで Google 検索',
    googleArtist: '作者名で Google 検索',
    noCandidates: '候補がありません',
    score: 'タイトル類似度',
    openProduct: '商品ページを開く',
    resolveAgain: '自動で再取得'
  },

  favorites: {
    artists: 'お気に入りのアーティスト',
    narrow: '絞り込み',
    members: 'メンバー',
    noOwnNames: '絞り込める項目がありません',
    noArtists: 'ブックマークした作品にアーティスト情報がありません',
    bookmarkCount: 'ブックマーク {n} 件',
    multiSelect: '複数選べます',
    newest: 'お気に入りの新着',
    includeGroups: 'グループ（サークル）も含める',
    excludeCollective: '多数参加作品の作者を除く',
    artistScope: '作者の範囲',
    allArtists: 'すべての作者',
    excludeCollectiveTitle: 'アンソロジーや雑誌など、アーティストが多数いるブックマークにしか出てこない作者を、この一覧と検索から外します',
    hideBookmarked: 'ブックマーク済みを隠す',
    searchInBrowse: 'サイトでこのアーティストを検索',
    openInBrowse: 'サイトで開く',
    emptyNoBookmarks: 'ブックマークするとアーティストの作品がここに並びます',
    empty: '該当する作品がありません'
  },

  viewHeader: {
    own: 'このユーザーの{filter}',
    ownTitle: 'このユーザーのポストには、どの一覧でも共通の設定の代わりにこの値を使います。値は共通の設定に対する割合で保存され、共通の設定を変えるとそれに合わせて変わります（共通が 1000 の時に 100 にすると、共通を 10000 にした時は 1000）',
    common: '共通の設定（{value}）',
    ownBetween: '{n} 以上'
  },

  browse: {
    fromClipboard: 'クリップボードから',
    fromClipboardTitle: 'クリップボードにある URL などを入れて表示します',
    viewHint: '上の欄に入力するか、クリップボードから貼ってください',
    empty: '該当する作品がありません'
  },

  history: {
    title: '履歴',
    empty: 'まだ作品を開いていません',
    clear: '履歴を消去',
    clearConfirm: '履歴をすべて消去しますか？',
    remove: '履歴から外す',
    filter: 'タイトル・作者で絞り込む',
    fromBrowse: 'サイトから開いた',
    fromFavorites: 'お気に入りから開いた',
    fromBookmarks: 'ブックマークから開いた',
    fromLocal: 'ローカルから開いた',
    openedAt: '{date} に開いた'
  },

  fileName: {
    siteDescription: '{name} の作品にだけ使う書式です。空にするとプラグインのおすすめの書式になります',
    sitePreset: '{name} のおすすめ',
    commonPreset: '共通の書式と同じ',
    presets: {
      groupArtistTitle: '[サークル (作者)] タイトル',
      groupFolder: 'サークルごとのフォルダ',
      creatorFolder: 'サークル（無ければ作者）ごとのフォルダ',
      artistFolder: '作者ごとのフォルダ',
      groupFolderWithId: 'サークルフォルダ + 作者 + ID',
      titleWithId: 'タイトル (ID)'
    },
    applyConfirm: 'ダウンロード済みの cbz を現在の書式でリネーム・移動しますか？',
    renamed: '{n} 件のファイルをリネームしました',
    title: 'ファイル名の書式',
    description: '作品ごとに 1 つの cbz（無圧縮の zip）として保存します。{artist} {group} は DLsite 等から取得した作者情報です。/ でフォルダを分けられます',
    preset: 'プリセット',
    presetPlaceholder: 'プリセット…',
    example: '例:',
    autoRename: '作者情報が更新された場合は自動でリネームされます。書式を変えた時は既存ファイルに適用してください。',
    applying: '適用中…',
    apply: '既存のファイルに適用',
    sampleSeries: 'シリーズ名',
    placeholders: {
      title: 'タイトル（日本語タイトル優先）',
      title_alt: 'サイトでの表記のタイトル（ローマ字・英題など）',
      artist: '作者（DLsite 等から取得した情報）',
      group: 'サークル（DLsite 等から取得した情報）',
      circle: '{group} と同じ',
      creator: 'サークル名（無ければアーティスト名）',
      parody: '原作・シリーズ',
      type: '種別（doujinshi, manga など）',
      language: '言語',
      date: '投稿日（YYYY-MM-DD）',
      year: '投稿年',
      series: 'シリーズ名（シリーズに入れていなければ空。フォルダ名だけに使った時はフォルダを作らない）',
      series_no: 'シリーズ内の番号（01, 02 …）',
      id: '作品 ID',
      site: 'サイト名'
    }
  },

  gallery: {
    attachments: '添付ファイル（{n}）',
    openAttachment: '{name} をブラウザで開く',
    originPages: '（p.{from}–{to}）',
    editTitle: 'タイトルを変える（このアプリの中だけ。空にすると元のタイトルに戻る）',
    titleSaved: 'タイトルを変えました',
    titleReset: 'タイトルを元に戻しました',
    notInList: '開いた一覧の中にこの作品が見つかりません',
    noBookmarks: 'ブックマークがありません',
    lastWork: '最後の作品です',
    firstWork: '最初の作品です',
    nextFailed: '次の作品を読み込めませんでした: {error}',
    closePanel: '情報パネルを閉じる',
    read: '読む',
    openPanel: '情報パネルを開く',
    loadFailed: '作品情報を取得できませんでした',
    origin: '元の作品:',
    openOrigin: '元の作品の開始ページを開く',
    openSite: 'サイトで開く',
    creatorResolving: 'DLsite / FANZA で検索中…',
    source: '取得元',
    notFound: '見つからず（作品の情報）',
    changeSeries: 'シリーズを変更・外す',
    openSeries: 'ブックマーク画面でこのシリーズを開く',
    siteNames: 'サイトのアーティスト・グループ',
    siteNamesHint: 'お気に入り検索で、この名前の新作を探します',
    actions: {
      retryRange: '再試行',
      retryRangeTitle: '取得済みのページはそのまま使い、足りないページだけ取ります',
      buildRange: 'ダウンロード',
      buildRangeTitle: 'ページ範囲を cbz にして保存します',
      pause: '一時停止',
      download: 'ダウンロード'
    }
  },

  galleryItem: {
    bookmark: 'ブックマーク',
    unbookmark: 'ブックマーク解除',
    bookmarked: 'ブックマーク済'
  },

  tagPicker: {
    remove: '外す',
    unset: '未設定',
    fromOrigin: '元の作品から:',
    addAs: '{kind}として追加',
    groupSuffix: ' (グループ)',
    placeholder: 'サイトのアーティスト名・グループ名で検索'
  },

  keys: {
    groups: {
      viewer: 'ビューア',
      page: 'ページ送り',
      display: '表示',
      bookmark: 'ブックマーク',
      slideshow: 'スライドショー',
      global: 'アプリ全体'
    },
    moved: '{combo} を「{action}」から移しました',
    removeBinding: 'この割り当てを外す',
    addKey: 'キーを追加',
    pressKey: 'キーを押してください（Esc で取消）',
    resetOne: '既定に戻す',
    escFixed: 'Esc（ページ一覧・全画面を閉じる）は固定です',
    resetAll: 'すべて既定に戻す',
    mouseGestures: 'マウスジェスチャ',
    mouseGesturesHint: '右ボタンを押したまま左クリックで戻る／左ボタンを押したまま右クリックで進む',
    mouse: {
      middle: 'マウス3',
      back: 'マウス4',
      forward: 'マウス5'
    },
    actions: {
      pageLeft: '左のページへ（右綴じでは次）',
      pageRight: '右のページへ（右綴じでは前）',
      next: '次のページ',
      prev: '前のページ',
      first: '最初のページ',
      last: '最後のページ',
      modeSingle: '単ページ表示',
      modeSpread: '見開き表示',
      modeScroll: '縦スクロール表示',
      fullscreen: '全画面の切り替え',
      thumbs: 'ページ一覧',
      shift: '見開きを 1 枚ずらす',
      bookmark: 'ブックマークの切り替え',
      nextBookmark: '次の作品（開いた一覧の順。ブックマークからならブックマーク画面の並び順）',
      prevBookmark: '前の作品（開いた一覧の順。ブックマークからならブックマーク画面の並び順）',
      slideshow: 'スライドショーを開始・停止',
      slideSlower: 'スライドショーの秒数を 1 秒増やす',
      slideFaster: 'スライドショーの秒数を 1 秒減らす',
      back: '前の画面へ戻る',
      forward: '次の画面へ進む'
    }
  },

  list: {
    listView: 'リスト表示',
    gridView: 'グリッド表示',
    thumbSize: 'サムネイルの大きさ（ダブルクリックで元に戻す）',
    resizePanel: 'ドラッグで幅を変更（ダブルクリックで元に戻す）',
    openPanel: '絞り込みを開く',
    closePanel: '絞り込みを閉じる'
  },

  paged: {
    loadNext: '次のページ（{page}）を読み込む',
    pullHint: '一番下でさらに下へスクロールしても読み込めます',
    loadFailed: '読み込みに失敗しました',
    showing: '表示中 {page}',
    pageOf: ' ・ {page} / {total} ページ',
    loadPrev: '前のページ（{page}）を読み込む',
    lastPage: '最後のページです',
    divider: '{page}{total} ページ',
    dividerTotal: ' / {total}',
    noneMatched: ' ・ 該当なし',
    pageLoadFailed: '{page} ページ目の読み込みに失敗しました',
    failedItems: '（{n} 件取得失敗）',
    allHidden: 'このページの {n} 件はすべて絞り込みの条件に合いません',
    jump: 'ページへ移動'
  },

  pageRange: {
    title: 'ページ数で絞り込み（各ページの中で条件に合わない作品を隠します）',
    label: 'ページ数',
    min: '下限',
    max: '上限',
    clear: 'ページ数の絞り込みを解除'
  },

  pagination: {
    jump: '移動'
  },

  slideCurve: {
    title: 'スライドショーの秒数の自動調節（調整用）',
    hint: 'ページの複雑さの順位（サンプルのページの中で何 % の位置か）ごとに、秒数を何倍にするか。間は直線でつなぎます。この端末にだけ保存され、すぐに反映されます',
    percentile: '順位 %',
    factor: '倍率',
    reset: '初期値に戻す'
  },
  library: {
    rescan: '読み込み直す',
    rescanTitle: 'フォルダを読み込み直す（新しい cbz / zip を追加し、ファイルが無くなった作品を一覧から外します）',
    added: '{n} 作品を追加しました',
    noNew: '新しい作品はありません',
    remove: 'ライブラリから外す',
    removeConfirm: 'ライブラリから外しますか？（ファイルは削除されず、読み込み直しても戻りません）',
    removed: 'ライブラリから外しました',
    removedN: '{n} 作品をライブラリから外しました',
    removeManyConfirm: '{n} 作品をライブラリから外しますか？（ファイルは削除されず、読み込み直しても戻りません）',
    noResults: '「{query}」に一致する作品はありません',
    noDirs: 'ローカルのフォルダがまだありません。フォルダを追加すると、タブになって中の作品が並びます',
    missingGroup: 'ファイルがない作品',
    empty: 'このフォルダに作品がありません',
    emptyHint: '設定の「保存先」のフォルダに cbz / zip などを置いて、「読み込み直す」を押してください'
  },
  predecode: {
    title: '前もってデコードするページ数',
    description: '今のページの先 {ahead} 枚と前 {behind} 枚を表示できる状態にしておき、ページ送りの待ちをなくします。',
    hint: 'ビューアのページ番号にカーソルを合わせると、開いている作品での目安が出ます。',
    off: 'オフ（表示する直前にデコードします）',
    memory:
      '必要メモリの目安: 約 {total}（{count} 枚 × 約 {perPage}。1 ページ {width}×{height} の場合。大きな画像の作品ではこれより増えます）',
    viewerOff: '前もってデコード: オフ（設定で変更できます）',
    viewerOn: '前もってデコード: 先 {ahead} 枚・前 {behind} 枚（この作品で約 {bytes}）'
  },

  range: {
    bookmarked: 'p.{from}–{to} をブックマークしました',
    building: '（cbz を作成中）',
    pageLabel: '{label}ページ',
    start: '開始',
    end: '終了',
    unset: '未指定',
    pickTitle: 'ビューアでページをクリックして指定',
    picking: 'クリック待ち…',
    pick: 'ビューアで指定',
    title: 'ページ範囲をブックマーク',
    origin: '元の作品: {title}（全 {total} ページ）',
    artistRequired: '作者 *',
    artistPlaceholder: '作者名（複数はカンマ区切り）',
    optional: '任意',
    siteNames: 'サイトのアーティスト・グループ（お気に入り検索に使います）',
    saveCbz: 'cbz を作って保存する',
    pickHint: 'パネルを開いたままビューアを操作できます。「ビューアで指定」を押してからページをクリックしてください',
    willSave: '{n} ページを cbz にして保存します。解除すると cbz も削除されます',
    willLink: '{n} ページを元の作品から表示します（後からダウンロードして cbz にできます）',
    creating: '作成中…',
    bookmark: 'ブックマーク'
  },

  search: {
    placeholder: '検索',
    clear: 'クリア',
    submit: '検索 (Enter)'
  },

  settings: {
    title: '設定',
    siteScreens: 'サイトの画面の並べ方',
    siteScreensHint: '左のタブで、使っているサイトの下に並ぶ画面（ブラウズ・ブックマークなど）の並べ方',
    siteScreensList: '名前付きで縦に',
    siteScreensGrid: 'アイコンを 2 列に',
    siteScreensOpen: 'すべてのサイトの画面を常に表示する',
    siteScreensOpenHint: 'オフにすると、使っているサイトの画面だけを表示します',
    loadMore: '次のページを読み込むタイミング',
    loadMoreHint: '遅いほど、サイトへの読み込みが減ります（回数制限のあるサイト向け）',
    loadMoreNear: '最後に近づいたら自動で',
    loadMoreBottom: '一番下でさらにスクロールしたとき',
    loadMoreButton: 'ボタンを押したときだけ',
    showSecret: '表示する',
    hideSecret: '隠す',
    browse: '一覧',
    general: '表示と言語',
    sites: 'サイト',
    infiniteScroll: 'スクロールで次のページを自動で読み込む',
    infiniteScrollHint: 'オフにすると 1 ページずつ表示し、下にページ切り替えを出します',
    viewer: 'ビューア',
    spreadForManga: '漫画は見開きで開く',
    spreadForMangaHint: '単ページ・見開き・スクロールの切り替えは作品ごとに記憶されます。まだ切り替えたことのない作品は、直前に使った表示で開きますが、これをオンにするとサイトのプラグインが漫画とする種別（同人誌など）は見開きで開きます',
    moire: 'モアレ軽減',
    moireHint: '元の大きさより縮めて表示するページをなめらかにして、トーンがモアレになるのを抑えます。「強」はより抑えますが、細い線が少しやわらかくなります',
    moireOff: 'オフ',
    moireWeak: '弱',
    moireStrong: '強',
    autoFullscreen: '作品を開いたら自動で全画面にする',
    autoFullscreenHint: 'Esc や全画面ボタンで通常表示に戻せます。次/前のブックマークへの移動では今の表示を引き継ぎます',
    downloads: 'ブックマーク・ダウンロード',
    autoDownload: 'ブックマーク時に自動ダウンロード',
    deleteOnUnbookmark: 'ブックマーク解除時にファイルを削除',
    concurrency: '同時ダウンロード数（サイトごとの合計）',
    rangeThumb: 'ページ範囲ブックマークのサムネイル',
    rangeThumbHint: '範囲内の最初のページは、ダウンロードしていない時はサイトの小さいサムネイル（1 件 10KB ほど）を使います',
    rangeThumbPage: '範囲内の最初のページ',
    rangeThumbSource: '元の作品の表紙',
    tempFiles: '一時ファイル（.parts）の管理',
    tempFilesHint: 'ダウンロードしていないブックマークを閲覧した時に保存したページの扱い。ダウンロード中・一時停止中の途中のファイルは消しません。ブックマークに無い作品の一時ファイルは常に起動時に消します',
    tempFilesStartup: '起動時に削除',
    tempFilesViewerClose: 'ビューアを閉じたら削除',
    tempFilesPack: '全ページ揃ったら cbz にする',
    siteDir: '保存先',
    libraryDirHint: '変更しても既存のファイルは移動されません',
    siteDirDialog: '{name} の保存先フォルダを選択',
    login: 'ログイン',
    loginHint: 'サイトのログイン画面を開きます。ログインすると下のログイン情報が自動で入り、画面は閉じます',
    loginOpen: 'ログイン画面を開く',
    loginOther: '別のアカウントで',
    loginTitle: '{name} にログイン',
    loggedIn: '{name} のログイン情報を入れました',
    libraryDirChanged: '保存先を変更しました',
    localDirs: 'ローカルのフォルダ',
    localDirsHint: 'フォルダごとにタブができ、中の cbz / zip など（サブフォルダも含む）が並びます。ファイルは読むだけで、変更しません。アイコンを押すと変えられます',
    localDirsDialog: 'タブにするフォルダを選択',
    localDirName: 'タブの名前',
    localDirIcon: 'タブのアイコン',
    localDirUp: '上へ',
    localDirDown: '下へ',
    iconsFolder: 'アイコンのフォルダを開く',
    iconsReloadTitle: 'アイコンのフォルダを読み込み直す（png・svg・webp などを置けます）',
    localDirAdd: 'フォルダを追加',
    localDirAdded: 'フォルダを追加しました。作品を読み込んでいます',
    localDirRemove: '外す',
    localDirRemoveConfirm: '「{name}」のタブを外しますか？\nこのフォルダの作品は、タグやシリーズと一緒に一覧から消えます（ファイルは削除されません）',
    localDirRemoved: 'フォルダを外しました',
    restoreRemoved: '外した作品を戻す',
    restoreRemovedTitle: '「ライブラリから外す」で外した作品を、すべて一覧に戻します',
    change: '変更',
    metaSources: '作者情報の取得元',
    metaSourcesHint: 'ブックマークした作品のタイトルで検索し、作者名・サークル名を取得します。上にあるものが優先されます。見つからない場合は作品の情報を仮に使用します。日本語の作品（と言語の無い作品）だけが対象で、翻訳された作品はサイトのアーティスト名・グループ名をそのまま使います。',
    dlsite: 'DLsite（作者名・サークル名）',
    fanza: 'FANZA 同人（サークル名・作者名）',
    preferred: ' 優先',
    makePreferred: '優先にする',
    fallback: '見つからない時の補完',
    fallbackHint: 'タイトルで作者・サークルが分からない時は、有効にしたものを上から順に試して候補にします（pawchive は作品タイトル、DuckDuckGo はサイトのアーティスト名・グループ名で探します）。名前やタイトルの一致だけなので「要確認」になり、作者情報の画面で確定してください。',
    pawchiveHint: 'Patreon・FANBOX などの投稿のアーカイブを作品タイトルで検索し、似たタイトルの投稿の作者を候補にします',
    duckduckgoHint: 'アーティスト名で Web 検索し、結果のページ名（pixiv・X・FANBOX など）から作者名を読みます。短時間に何度も検索すると DuckDuckGo に拒否されることがあり、その時は次の補完先に進みます',
    plugins: 'プラグイン',
    noPlugins: '読み込まれたプラグインはありません',
    addPlugin: 'プラグインを追加',
    addPluginHint: 'プラグインのファイル（.wasm）を plugins フォルダにコピーします。同じプラグインの新しい版は古い版と置き換わります',
    addPluginButton: 'ファイルを選ぶ',
    addPluginTitle: 'プラグイン（.wasm）を選ぶ',
    pluginsAdded: '追加しました: {names}。使うには再起動してください',
    restart: '再起動',
    pluginHosts: '接続先: {hosts}',
    pluginFormats: 'Susie 書庫プラグイン（{formats}）',
    pluginDefault: '既定の{filter}',
    pluginDefaultHint: 'サイトの画面で変えると、ここにも保存されます',
    pluginsHint: 'プラグイン（.wasm）と Susie 64bit 書庫プラグイン（.sph）は、Poruneko.exe と同じ場所かデータフォルダの plugins フォルダに置くと、次の起動で読み込まれます。.wasm のプラグインは指定した接続先にだけ、アプリを通して接続できます。Susie プラグインはアプリの中で直接動くので、信頼できるものだけを入れてください',
    window: 'ウィンドウ',
    rememberWindow: 'ウィンドウの位置と大きさを記憶する',
    rememberWindowHint: '終了した時の位置・大きさ・最大化を次回の起動で復元します（モニタを外した時などは既定の位置で開きます）',
    rememberScreen: '終了した時の画面を次回の起動で開く',
    rememberScreenHint: '開いていたタブと一覧、作品（ページの位置も）を復元します。シャッフル再生は同じ順番で続きから。サイトやお気に入りの一覧から開いた作品では、次・前の作品はブックマークの順になります',
    keys: 'キー操作',
    uiLanguage: '表示言語',
    uiLanguageHint: '変更すると画面を読み込み直します',
    uiLanguageAuto: '自動（OS の言語）',
    fontScale: '文字の大きさ',
    fontScaleNormal: '{p}%（標準）',
    theme: 'テーマ',
    themeDark: 'ダーク',
    themeLight: 'ライト',
    themeSystem: 'OS の設定に合わせる',
    accent: 'アクセントカラー',
    accentDefault: '標準（ピンク）',
    accentCustom: '好きな色を選ぶ'
  },

  viewer: {
    videoPlay: '再生',
    videoPause: '一時停止',
    videoMute: '音を消す',
    videoUnmute: '音を出す',
    videoVolume: '音量',
    rangeStart: '開始',
    rangeEnd: '終了',
    markSeparator: '・',
    pickStart: '開始ページをクリックしてください',
    pickEnd: '終了ページをクリックしてください',
    pickHint: '見開きの左右どちらでも選べます。ページ送りはキーで、Esc で取り消し',
    cancelPick: '取り消し',
    framesLoaded: 'コマを読み込み中 {n} / {total}',
    reload: '再読み込み',
    prefetching: '全ページを先読みしています',
    prefetch: '先読み {done}/{total}',
    modes: {
      single: '単ページ (1)',
      spread: '見開き (2)',
      scroll: '縦スクロール (3)'
    },
    directionTitle: '綴じ方向（右綴じ: 左へ進む / 左綴じ: 右へ進む）',
    rtl: '右綴じ',
    ltr: '左綴じ',
    rtlShort: '右綴じ',
    ltrShort: '左綴じ',
    spread: '見開き',
    fitsShort: {
      contain: '画面',
      width: '幅',
      height: '高さ',
      original: '原寸'
    },
    coverSingleTitle: '表紙を単独で表示（見開きのずれ調整）',
    coverSingle: '表紙単独',
    shiftTitle: '見開きの組み合わせを今の位置から 1 枚ずらす (S)。同じ場所でもう一度押すと元に戻る',
    shift: '1枚ずらす',
    resetShiftTitle: '見開きを 1 枚ずらしています。押すとこの作品のずらしをすべて元に戻します',
    fit: '表示サイズ',
    fits: {
      contain: '画面に合わせる',
      width: '幅に合わせる',
      height: '高さに合わせる',
      original: '原寸'
    },
    thumbs: 'ページ一覧 (T)',
    display: '表示の設定（綴じ方向・画面への合わせ方・見開きの調整）',
    direction: '綴じ方向',
    slideshow: 'スライドショー',
    lockBar: 'ツールバーを固定する（常に表示し、ページはその上に収める）',
    unlockBar: 'ツールバーの固定を外す（カーソルを下に寄せた時だけ表示）',
    slideSecondsNow: 'スライドショー: {n} 秒ごと',
    slideshowStarted: 'スライドショー開始（{n} 秒ごと）',
    slideshowStopped: 'スライドショー停止',
    slideshowStart: 'スライドショー（{n} 秒ごと。カーソルを合わせると設定）',
    slideshowStop: 'スライドショーを止める',
    slideSeconds: '秒ごとに次のページ（Enter で開始）',
    toFirst: '最初のページへ',
    slidePlay: '再生',
    slideStop: '停止',
    slideSecondsUnit: '秒',
    slideNextWorkShort: '次の作品へ続ける',
    slideNextWork: '最後のページの後は次の作品へ進む',
    slideAutoShort: '自動',
    slideAuto: 'ページに合わせて秒数を自動で調節（β版）：絵や文字の多いページは長く、少ないページは短く表示します（指定した秒数は標準的なページ 1 回分の秒数で、見開きで 1 枚だけ表示する時はその半分）',
    timeLeft: '残り時間の表示（選んだ所を押し直すとオフ）',
    timeLeftClockLabel: '時計',
    timeLeftEdgeLabel: '進行バー',
    timeLeftOff: 'オフ',
    timeLeftReverse: '逆向き',
    timeLeftReverseTitle: '進行バーを反対側から伸ばす（右から左、下から上）。「縮む」の時は反対側へ縮める',
    timeLeftShrink: '縮む',
    timeLeftShrinkTitle: '進行バーを満タンから縮めていく（残っている長さが残り時間）',
    timeLeftClock: {
      tl: 'ツールバーが隠れている間、残り時間を左上に表示',
      tr: 'ツールバーが隠れている間、残り時間を右上に表示',
      bl: 'ツールバーが隠れている間、残り時間を左下に表示',
      br: 'ツールバーが隠れている間、残り時間を右下に表示'
    },
    timeLeftEdge: {
      top: '残り時間の進行バーを上の辺に表示',
      bottom: '残り時間の進行バーを下の辺に表示',
      left: '残り時間の進行バーを左の辺に表示',
      right: '残り時間の進行バーを右の辺に表示'
    },
    rangeBookmark: 'ページ範囲をブックマーク（作者名などを入力してから、開始ページ → 終了ページを指定）',
    exitFullscreen: '全画面終了 (Esc)',
    fullscreen: '全画面 (F)'
  },

  thumb: {
    change: 'サムネイルを変更',
    changeTitle: 'サムネイルにするページと範囲を選ぶ',
    title: 'サムネイルを選ぶ',
    prevPage: '前のページ',
    nextPage: '次のページ',
    lockRatio: 'カードの縦横比に合わせる',
    lockHint: '枠をドラッグで動かし、角で大きさを変えます',
    freeHint: '自由な縦横比で選べます。カードには選んだ範囲全体が収まるように縮めて表示します',
    saved: 'サムネイルを変更しました',
    reset: 'サムネイルを作品の表紙に戻しました',
    resetButton: '表紙に戻す'
  },

  androidConnect: {
    title: '接続先の PC',
    current: '接続中: {url}',
    hint: 'PC の設定（リモートアクセス）に表示されるアドレスに変えられます',
    change: '変更'
  },
  remote: {
    title: 'リモートアクセス',
    hint: 'タブレットやスマホのブラウザから、この PC の Poruneko を使えるようにします。家の Wi-Fi のほか、NordVPN Meshnet や Tailscale でつながった外出先の端末からも使えます（それ以外のインターネットからは接続できません）。使う間は PC を起動したままにしてください',
    password: 'パスワード',
    passwordHint: 'ブラウザでログインする時のパスワードです（8 文字以上）',
    passwordSet: '設定済み。新しく設定すると、ログイン中の端末はログアウトします',
    setPassword: '設定',
    passwordSaved: 'パスワードを設定しました',
    enable: 'リモートアクセスを有効にする',
    enableHint: '初めて有効にした時、Windows のファイアウォールの確認が出たら許可してください',
    failed: '開始できませんでした: {error}',
    urls: '接続先',
    urlsHint: '使う端末のブラウザで開いてください。Meshnet や Tailscale では 100. で始まるアドレスを使います。ホーム画面に追加するとアプリのように開けます',
    sessions: 'ログイン中の端末: {names}',
    deviceSettingsHint: '表示・ビューア・キーなどの設定は、ログイン時に付けた端末の名前ごとに保存されます（この PC の設定は変わりません）',
    signOutAll: 'すべてログアウト',
    signedOut: 'すべての端末をログアウトしました'
  },
  update: {
    title: 'アップデート',
    available: 'Poruneko {version} が利用できます',
    install: '更新して再起動',
    notes: 'リリースノート',
    later: '後で',
    skip: 'この版を飛ばす',
    skipTitle: 'この版については通知しない（設定の「今すぐ確認」では通知する）',
    preparing: 'ダウンロードを準備中…',
    downloading: 'ダウンロード中… {percent}%',
    openGitHub: 'GitHub で見る',
    upToDate: '最新の版です',
    version: 'バージョン {version}',
    checkHint: 'GitHub のリリースから新しい版を探します',
    checkNow: '今すぐ確認',
    checkAtStart: '起動時に新しい版を確認する'
  },

  toasts: {
    unbookmarked: 'ブックマークを解除しました',
    rangeGone: 'この作品は削除済みです（元の作品から作り直してください）',
    bookmarkedDownloading: 'ブックマークしました（ダウンロード開始）',
    bookmarked: 'ブックマークしました'
  },

  /** Errors returned from Go (code -> text). {detail} is the English text of the original error */
  errors: {
    plugin: {
      message: '{text}',
      notWasm: 'プラグインのファイル（.wasm）を選んでください',
      invalid: 'Poruneko のプラグインではありません: {detail}',
      copyFailed: 'プラグインをコピーできませんでした: {detail}'
    },
    remote: {
      shortPassword: 'パスワードは {min} 文字以上にしてください',
      noPassword: '先にパスワードを設定してください',
      listenFailed: 'リモートアクセスを開始できませんでした: {detail}'
    },
    site: {
      noAction: 'このサイトではその操作はできません'
    },
    login: {
      none: 'このサイトにはログイン画面がありません',
      busy: 'ログイン画面がすでに開いています',
      unsupported: 'この環境ではログイン画面を開けません。ログイン情報を貼ってください',
      failed: 'ログイン画面を開けませんでした: {detail}'
    },
    range: {
      invalid: 'ページ範囲が正しくありません（1〜{max}）',
      noArtist: '作者名を入力してください',
      noTitle: 'タイトルを入力してください',
      duplicate: '同じページ範囲のブックマークが既にあります',
      noOrigin: 'ページ範囲の情報がありません',
      sourceUnavailable: '元の作品を取得できません: {detail}',
      notRange: 'ページ範囲から作った作品ではありません',
      pageMismatch: '元の作品のページ数（{pages}）がページ範囲と合いません',
      noSourcePages: '元の作品のページがありません',
      interrupted: '作成が中断されました'
    },
    bookmark: {
      notBookmarked: 'ブックマークされていません',
      unknownURL: 'この URL の作品を扱えるサイトがありません'
    },
    creator: {
      unsupportedUrl: 'DLsite か FANZA 同人の作品ページの URL を入れてください',
      urlFailed: 'ページから作者情報を読めませんでした: {detail}',
      autoNotForRange: 'ページ範囲から作った作品は作者情報を自動取得できません（手動で編集してください）'
    },
    download: {
      deleteWhileBuilding: 'cbz の作成中は削除できません',
      notDownloaded: 'まだダウンロードされていません',
      pagesFailed: '{count} ページの取得に失敗しました（{detail}）',
      packFailed: 'cbz の作成に失敗しました: {detail}',
      pageMissing: 'ページ {page} がありません'
    },
    library: {
      dirOverlapsSave: 'このフォルダはサイトの保存先（{path}）と重なっています',
      dirOverlapsLocal: 'このフォルダはローカルのフォルダ（{path}）と重なっています',
      dirOverlaps: 'このフォルダは追加済みのフォルダ（{path}）と重なっています',
      missing: 'フォルダが読めません（フォルダが戻ると自動で直ります）',
      noInfo: '作品情報がありません'
    },
    tags: {
      noName: 'タグの名前を入力してください'
    },
    favorites: {
      unsupported: 'このサイトはお気に入り検索に対応していません'
    },
    series: {
      noName: 'シリーズ名を入力してください',
      notFound: 'シリーズが見つかりません'
    },
    settings: {
      renameFailed: '{count} 件のリネームに失敗しました'
    },
    thumb: {
      invalidImage: 'サムネイルの画像を作れませんでした',
      saveFailed: 'サムネイルを保存できませんでした: {detail}'
    },
    update: {
      checkFailed: '新しい版を確認できませんでした: {detail}',
      noUpdate: '新しい版はありません',
      noAsset: 'この版には配布ファイルがありません',
      noChecksum: '配布ファイルのチェックサムが無いため更新できません',
      downloadFailed: 'ダウンロードに失敗しました: {detail}',
      checksumMismatch: 'ダウンロードしたファイルが正しくありません（チェックサムが一致しません）',
      writeFailed: 'アプリを置き換えられませんでした（フォルダに書き込めるか確認してください）: {detail}',
      restartFailed: '更新しましたが再起動できませんでした。手動で起動してください',
      failed: '更新に失敗しました: {detail}'
    },
    url: {
      notHTTP: 'http(s) の URL ではありません'
    }
  }
}

export type Dict = typeof ja
