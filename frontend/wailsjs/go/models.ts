export namespace model {
	
	export class ThumbSpec {
	    page: number;
	    x: number;
	    y: number;
	    w: number;
	    h: number;
	    free: boolean;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new ThumbSpec(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.page = source["page"];
	        this.x = source["x"];
	        this.y = source["y"];
	        this.w = source["w"];
	        this.h = source["h"];
	        this.free = source["free"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class DownloadState {
	    status: string;
	    done: number;
	    total: number;
	    error?: string;
	    errorCode?: string;
	    errorParams?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new DownloadState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.done = source["done"];
	        this.total = source["total"];
	        this.error = source["error"];
	        this.errorCode = source["errorCode"];
	        this.errorParams = source["errorParams"];
	    }
	}
	export class CreatorCandidate {
	    source: string;
	    productId: string;
	    productTitle: string;
	    url: string;
	    circle: string;
	    artists: string[];
	    score: number;
	
	    static createFrom(source: any = {}) {
	        return new CreatorCandidate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.source = source["source"];
	        this.productId = source["productId"];
	        this.productTitle = source["productTitle"];
	        this.url = source["url"];
	        this.circle = source["circle"];
	        this.artists = source["artists"];
	        this.score = source["score"];
	    }
	}
	export class CreatorInfo {
	    status: string;
	    circle: string;
	    artists: string[];
	    source: string;
	    productId?: string;
	    productTitle?: string;
	    url?: string;
	    score?: number;
	    candidates?: CreatorCandidate[];
	    resolvedAt?: number;
	
	    static createFrom(source: any = {}) {
	        return new CreatorInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.circle = source["circle"];
	        this.artists = source["artists"];
	        this.source = source["source"];
	        this.productId = source["productId"];
	        this.productTitle = source["productTitle"];
	        this.url = source["url"];
	        this.score = source["score"];
	        this.candidates = this.convertValues(source["candidates"], CreatorCandidate);
	        this.resolvedAt = source["resolvedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Origin {
	    key: string;
	    title: string;
	    from: number;
	    to: number;
	    tags?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Origin(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.title = source["title"];
	        this.from = source["from"];
	        this.to = source["to"];
	        this.tags = source["tags"];
	    }
	}
	export class TagInfo {
	    ns: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new TagInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ns = source["ns"];
	        this.name = source["name"];
	    }
	}
	export class GallerySummary {
	    key: string;
	    site: string;
	    id: string;
	    title: string;
	    japaneseTitle: string;
	    type: string;
	    language: string;
	    languageLocal: string;
	    date: string;
	    artists: string[];
	    groups: string[];
	    parodies: string[];
	    characters: string[];
	    tags: TagInfo[];
	    pageCount: number;
	    origin?: Origin;
	
	    static createFrom(source: any = {}) {
	        return new GallerySummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.site = source["site"];
	        this.id = source["id"];
	        this.title = source["title"];
	        this.japaneseTitle = source["japaneseTitle"];
	        this.type = source["type"];
	        this.language = source["language"];
	        this.languageLocal = source["languageLocal"];
	        this.date = source["date"];
	        this.artists = source["artists"];
	        this.groups = source["groups"];
	        this.parodies = source["parodies"];
	        this.characters = source["characters"];
	        this.tags = this.convertValues(source["tags"], TagInfo);
	        this.pageCount = source["pageCount"];
	        this.origin = this.convertValues(source["origin"], Origin);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Bookmark {
	    key: string;
	    addedAt: number;
	    summary: GallerySummary;
	    creator: CreatorInfo;
	    download: DownloadState;
	    archiveFile?: string;
	    tags?: string[];
	    customThumb?: ThumbSpec;
	    customTitle?: string;
	
	    static createFrom(source: any = {}) {
	        return new Bookmark(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.addedAt = source["addedAt"];
	        this.summary = this.convertValues(source["summary"], GallerySummary);
	        this.creator = this.convertValues(source["creator"], CreatorInfo);
	        this.download = this.convertValues(source["download"], DownloadState);
	        this.archiveFile = source["archiveFile"];
	        this.tags = source["tags"];
	        this.customThumb = this.convertValues(source["customThumb"], ThumbSpec);
	        this.customTitle = source["customTitle"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class FavoriteName {
	    tag: string;
	    name: string;
	    ns: string;
	    bookmarks: number;
	
	    static createFrom(source: any = {}) {
	        return new FavoriteName(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tag = source["tag"];
	        this.name = source["name"];
	        this.ns = source["ns"];
	        this.bookmarks = source["bookmarks"];
	    }
	}
	export class FavoritesQuery {
	    language: string;
	    page: number;
	    tag: string;
	    includeGroups: boolean;
	    types: string[];
	    hideBookmarked: boolean;
	    excludeCollective: boolean;
	    minPages?: number;
	    maxPages?: number;
	
	    static createFrom(source: any = {}) {
	        return new FavoritesQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.language = source["language"];
	        this.page = source["page"];
	        this.tag = source["tag"];
	        this.includeGroups = source["includeGroups"];
	        this.types = source["types"];
	        this.hideBookmarked = source["hideBookmarked"];
	        this.excludeCollective = source["excludeCollective"];
	        this.minPages = source["minPages"];
	        this.maxPages = source["maxPages"];
	    }
	}
	export class FavoritesResult {
	    items: GallerySummary[];
	    failed: string[];
	    total: number;
	    page: number;
	    perPage: number;
	    hidden: number;
	    names: FavoriteName[];
	
	    static createFrom(source: any = {}) {
	        return new FavoritesResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], GallerySummary);
	        this.failed = source["failed"];
	        this.total = source["total"];
	        this.page = source["page"];
	        this.perPage = source["perPage"];
	        this.hidden = source["hidden"];
	        this.names = this.convertValues(source["names"], FavoriteName);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PageInfo {
	    index: number;
	    name: string;
	    width: number;
	    height: number;
	
	    static createFrom(source: any = {}) {
	        return new PageInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.name = source["name"];
	        this.width = source["width"];
	        this.height = source["height"];
	    }
	}
	export class GalleryDetail {
	    key: string;
	    site: string;
	    id: string;
	    title: string;
	    japaneseTitle: string;
	    type: string;
	    language: string;
	    languageLocal: string;
	    date: string;
	    artists: string[];
	    groups: string[];
	    parodies: string[];
	    characters: string[];
	    tags: TagInfo[];
	    pageCount: number;
	    origin?: Origin;
	    pages: PageInfo[];
	
	    static createFrom(source: any = {}) {
	        return new GalleryDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.site = source["site"];
	        this.id = source["id"];
	        this.title = source["title"];
	        this.japaneseTitle = source["japaneseTitle"];
	        this.type = source["type"];
	        this.language = source["language"];
	        this.languageLocal = source["languageLocal"];
	        this.date = source["date"];
	        this.artists = source["artists"];
	        this.groups = source["groups"];
	        this.parodies = source["parodies"];
	        this.characters = source["characters"];
	        this.tags = this.convertValues(source["tags"], TagInfo);
	        this.pageCount = source["pageCount"];
	        this.origin = this.convertValues(source["origin"], Origin);
	        this.pages = this.convertValues(source["pages"], PageInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class HistoryEntry {
	    key: string;
	    summary: GallerySummary;
	    openedAt: number;
	    origin: string;
	
	    static createFrom(source: any = {}) {
	        return new HistoryEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.summary = this.convertValues(source["summary"], GallerySummary);
	        this.openedAt = source["openedAt"];
	        this.origin = source["origin"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ListQuery {
	    query: string;
	    language: string;
	    sort: string;
	    page: number;
	    minPages?: number;
	    maxPages?: number;
	
	    static createFrom(source: any = {}) {
	        return new ListQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.query = source["query"];
	        this.language = source["language"];
	        this.sort = source["sort"];
	        this.page = source["page"];
	        this.minPages = source["minPages"];
	        this.maxPages = source["maxPages"];
	    }
	}
	export class ListResult {
	    items: GallerySummary[];
	    failed: string[];
	    total: number;
	    page: number;
	    perPage: number;
	    hidden: number;
	
	    static createFrom(source: any = {}) {
	        return new ListResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], GallerySummary);
	        this.failed = source["failed"];
	        this.total = source["total"];
	        this.page = source["page"];
	        this.perPage = source["perPage"];
	        this.hidden = source["hidden"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class RangeRequest {
	    sourceKey: string;
	    from: number;
	    to: number;
	    title: string;
	    artists: string[];
	    circle: string;
	    siteArtists: string[];
	    siteGroups: string[];
	    download: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RangeRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceKey = source["sourceKey"];
	        this.from = source["from"];
	        this.to = source["to"];
	        this.title = source["title"];
	        this.artists = source["artists"];
	        this.circle = source["circle"];
	        this.siteArtists = source["siteArtists"];
	        this.siteGroups = source["siteGroups"];
	        this.download = source["download"];
	    }
	}
	export class Series {
	    id: string;
	    name: string;
	    createdAt: number;
	    keys: string[];
	
	    static createFrom(source: any = {}) {
	        return new Series(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.createdAt = source["createdAt"];
	        this.keys = source["keys"];
	    }
	}
	export class ViewerSettings {
	    mode: string;
	    direction: string;
	    coverSingle: boolean;
	    fit: string;
	    predecode: number;
	    autoFullscreen: boolean;
	    spreadForManga: boolean;
	    slideSeconds: number;
	    slideNextWork: boolean;
	    slideAuto: boolean;
	    slideClock: string;
	    slideEdge: string;
	    slideEdgeReverse: boolean;
	    slideEdgeShrink: boolean;
	    slideTimeLeft?: boolean;
	    barLocked: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ViewerSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.direction = source["direction"];
	        this.coverSingle = source["coverSingle"];
	        this.fit = source["fit"];
	        this.predecode = source["predecode"];
	        this.autoFullscreen = source["autoFullscreen"];
	        this.spreadForManga = source["spreadForManga"];
	        this.slideSeconds = source["slideSeconds"];
	        this.slideNextWork = source["slideNextWork"];
	        this.slideAuto = source["slideAuto"];
	        this.slideClock = source["slideClock"];
	        this.slideEdge = source["slideEdge"];
	        this.slideEdgeReverse = source["slideEdgeReverse"];
	        this.slideEdgeShrink = source["slideEdgeShrink"];
	        this.slideTimeLeft = source["slideTimeLeft"];
	        this.barLocked = source["barLocked"];
	    }
	}
	export class Settings {
	    libraryDir: string;
	    language: string;
	    sort: string;
	    autoDownload: boolean;
	    deleteFilesOnUnbookmark: boolean;
	    downloadConcurrency: number;
	    imageFormat: string;
	    tempFiles: string;
	    fontScale: number;
	    theme: string;
	    accent: string;
	    updateCheck: string;
	    uiLanguage: string;
	    rangeThumb: string;
	    viewer: ViewerSettings;
	    metaSources: string[];
	    fallbackSources: string[];
	    sourcesRev: number;
	    keybindings: Record<string, Array<string>>;
	    infiniteScroll: boolean;
	    rememberWindow: boolean;
	    rememberScreen: boolean;
	    mouseGestures: boolean;
	    fileNameFormat: string;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.libraryDir = source["libraryDir"];
	        this.language = source["language"];
	        this.sort = source["sort"];
	        this.autoDownload = source["autoDownload"];
	        this.deleteFilesOnUnbookmark = source["deleteFilesOnUnbookmark"];
	        this.downloadConcurrency = source["downloadConcurrency"];
	        this.imageFormat = source["imageFormat"];
	        this.tempFiles = source["tempFiles"];
	        this.fontScale = source["fontScale"];
	        this.theme = source["theme"];
	        this.accent = source["accent"];
	        this.updateCheck = source["updateCheck"];
	        this.uiLanguage = source["uiLanguage"];
	        this.rangeThumb = source["rangeThumb"];
	        this.viewer = this.convertValues(source["viewer"], ViewerSettings);
	        this.metaSources = source["metaSources"];
	        this.fallbackSources = source["fallbackSources"];
	        this.sourcesRev = source["sourcesRev"];
	        this.keybindings = source["keybindings"];
	        this.infiniteScroll = source["infiniteScroll"];
	        this.rememberWindow = source["rememberWindow"];
	        this.rememberScreen = source["rememberScreen"];
	        this.mouseGestures = source["mouseGestures"];
	        this.fileNameFormat = source["fileNameFormat"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SiteInfo {
	    id: string;
	    name: string;
	    favorites: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SiteInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.favorites = source["favorites"];
	    }
	}
	export class Suggestion {
	    ns: string;
	    name: string;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new Suggestion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ns = source["ns"];
	        this.name = source["name"];
	        this.count = source["count"];
	    }
	}
	
	

}

export namespace update {
	
	export class Release {
	    version: string;
	    notes: string;
	    url: string;
	    canInstall: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Release(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.notes = source["notes"];
	        this.url = source["url"];
	        this.canInstall = source["canInstall"];
	    }
	}

}

