export namespace main {
	
	export class IconFile {
	    name: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new IconFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.url = source["url"];
	    }
	}
	export class PluginInfo {
	    abi: number;
	    kind: string;
	    id: string;
	    name: string;
	    version: string;
	    hosts: string[];
	    displayHosts?: string[];
	    capabilities: string[];
	    siteCreators?: boolean;
	    ownFavorites?: boolean;
	    loadMore?: string;
	    fileNameFormat?: string;
	    icon?: string;
	    browse?: model.BrowseSpec;
	    pace?: Record<string, number>;
	    // Go type: plugin
	    login?: any;
	    file: string;
	    formats: string[];
	
	    static createFrom(source: any = {}) {
	        return new PluginInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.abi = source["abi"];
	        this.kind = source["kind"];
	        this.id = source["id"];
	        this.name = source["name"];
	        this.version = source["version"];
	        this.hosts = source["hosts"];
	        this.displayHosts = source["displayHosts"];
	        this.capabilities = source["capabilities"];
	        this.siteCreators = source["siteCreators"];
	        this.ownFavorites = source["ownFavorites"];
	        this.loadMore = source["loadMore"];
	        this.fileNameFormat = source["fileNameFormat"];
	        this.icon = source["icon"];
	        this.browse = this.convertValues(source["browse"], model.BrowseSpec);
	        this.pace = source["pace"];
	        this.login = this.convertValues(source["login"], null);
	        this.file = source["file"];
	        this.formats = source["formats"];
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

}

export namespace model {
	
	export class Attachment {
	    index: number;
	    name: string;
	    kind: string;
	    size?: number;
	
	    static createFrom(source: any = {}) {
	        return new Attachment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.size = source["size"];
	    }
	}
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
	export class TitleCreators {
	    circle?: string;
	    artists?: string[];
	
	    static createFrom(source: any = {}) {
	        return new TitleCreators(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.circle = source["circle"];
	        this.artists = source["artists"];
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
	    description?: string;
	    stats?: Record<string, number>;
	    owner?: string;
	    titleCreators?: TitleCreators;
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
	        this.description = source["description"];
	        this.stats = source["stats"];
	        this.owner = source["owner"];
	        this.titleCreators = this.convertValues(source["titleCreators"], TitleCreators);
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
	export class ViewSpec {
	    id: string;
	    label: Record<string, string>;
	    icon?: string;
	    placeholder?: Record<string, string>;
	    hint?: Record<string, string>;
	    namespaces?: string[];
	    aliases?: string[];
	
	    static createFrom(source: any = {}) {
	        return new ViewSpec(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.icon = source["icon"];
	        this.placeholder = source["placeholder"];
	        this.hint = source["hint"];
	        this.namespaces = source["namespaces"];
	        this.aliases = source["aliases"];
	    }
	}
	export class StatSpec {
	    id: string;
	    label: Record<string, string>;
	    icon?: string;
	
	    static createFrom(source: any = {}) {
	        return new StatSpec(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.icon = source["icon"];
	    }
	}
	export class Namespace {
	    id: string;
	    label: Record<string, string>;
	    suffix?: string;
	    color?: string;
	    translated?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Namespace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.suffix = source["suffix"];
	        this.color = source["color"];
	        this.translated = source["translated"];
	    }
	}
	export class FilterOption {
	    value: string;
	    label: Record<string, string>;
	    color?: string;
	    spread?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FilterOption(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.value = source["value"];
	        this.label = source["label"];
	        this.color = source["color"];
	        this.spread = source["spread"];
	    }
	}
	export class FilterSpec {
	    id: string;
	    label: Record<string, string>;
	    options: FilterOption[];
	    default: string;
	    in?: string[];
	    multi?: boolean;
	    onSearch?: string;
	    stat?: string;
	    kind?: string;
	    hint?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new FilterSpec(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.options = this.convertValues(source["options"], FilterOption);
	        this.default = source["default"];
	        this.in = source["in"];
	        this.multi = source["multi"];
	        this.onSearch = source["onSearch"];
	        this.stat = source["stat"];
	        this.kind = source["kind"];
	        this.hint = source["hint"];
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
	export class BrowseSpec {
	    placeholder?: Record<string, string>;
	    filters: FilterSpec[];
	    namespaces?: Namespace[];
	    stats?: StatSpec[];
	    creatorLabels?: Record<string, any>;
	    views?: ViewSpec[];
	    favoritesLabel?: Record<string, string>;
	    favoritesIcon?: string;
	    favoritesScoped?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new BrowseSpec(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.placeholder = source["placeholder"];
	        this.filters = this.convertValues(source["filters"], FilterSpec);
	        this.namespaces = this.convertValues(source["namespaces"], Namespace);
	        this.stats = this.convertValues(source["stats"], StatSpec);
	        this.creatorLabels = source["creatorLabels"];
	        this.views = this.convertValues(source["views"], ViewSpec);
	        this.favoritesLabel = source["favoritesLabel"];
	        this.favoritesIcon = source["favoritesIcon"];
	        this.favoritesScoped = source["favoritesScoped"];
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
	
	
	
	export class ViewLink {
	    view: string;
	    query: string;
	
	    static createFrom(source: any = {}) {
	        return new ViewLink(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.view = source["view"];
	        this.query = source["query"];
	    }
	}
	export class FavoriteName {
	    tag: string;
	    name: string;
	    ns: string;
	    bookmarks: number;
	    note?: string;
	    parents?: string[];
	    parent?: boolean;
	    open?: ViewLink;
	
	    static createFrom(source: any = {}) {
	        return new FavoriteName(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tag = source["tag"];
	        this.name = source["name"];
	        this.ns = source["ns"];
	        this.bookmarks = source["bookmarks"];
	        this.note = source["note"];
	        this.parents = source["parents"];
	        this.parent = source["parent"];
	        this.open = this.convertValues(source["open"], ViewLink);
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
	export class FavoritesQuery {
	    site?: string;
	    filters: Record<string, string>;
	    page: number;
	    tag: string;
	    includeGroups: boolean;
	    hideBookmarked: boolean;
	    excludeCollective: boolean;
	    minPages?: number;
	    maxPages?: number;
	
	    static createFrom(source: any = {}) {
	        return new FavoritesQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.site = source["site"];
	        this.filters = source["filters"];
	        this.page = source["page"];
	        this.tag = source["tag"];
	        this.includeGroups = source["includeGroups"];
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
	    more?: boolean;
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
	        this.more = source["more"];
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
	    video?: boolean;
	    delay?: number;
	
	    static createFrom(source: any = {}) {
	        return new PageInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.name = source["name"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.video = source["video"];
	        this.delay = source["delay"];
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
	    description?: string;
	    stats?: Record<string, number>;
	    owner?: string;
	    titleCreators?: TitleCreators;
	    origin?: Origin;
	    pages: PageInfo[];
	    attachments?: Attachment[];
	
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
	        this.description = source["description"];
	        this.stats = source["stats"];
	        this.owner = source["owner"];
	        this.titleCreators = this.convertValues(source["titleCreators"], TitleCreators);
	        this.origin = this.convertValues(source["origin"], Origin);
	        this.pages = this.convertValues(source["pages"], PageInfo);
	        this.attachments = this.convertValues(source["attachments"], Attachment);
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
	    site?: string;
	    view?: string;
	    query: string;
	    filters: Record<string, string>;
	    page: number;
	    minPages?: number;
	    maxPages?: number;
	
	    static createFrom(source: any = {}) {
	        return new ListQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.site = source["site"];
	        this.view = source["view"];
	        this.query = source["query"];
	        this.filters = source["filters"];
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
	    more?: boolean;
	
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
	        this.more = source["more"];
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
	export class LocalDir {
	    id: number;
	    path: string;
	    name: string;
	    icon: string;
	
	    static createFrom(source: any = {}) {
	        return new LocalDir(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.name = source["name"];
	        this.icon = source["icon"];
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
	    folder?: string;
	
	    static createFrom(source: any = {}) {
	        return new Series(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.createdAt = source["createdAt"];
	        this.keys = source["keys"];
	        this.folder = source["folder"];
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
	    moire: string;
	
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
	        this.moire = source["moire"];
	    }
	}
	export class Settings {
	    libraryDir: string;
	    pluginSettings: Record<string, any>;
	    siteDirs: Record<string, string>;
	    autoDownload: boolean;
	    deleteFilesOnUnbookmark: boolean;
	    downloadConcurrency: number;
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
	    siteOrder: string[];
	    siteScreenOrder: Record<string, Array<string>>;
	    siteScreens: string;
	    siteScreensOpen: boolean;
	    siteLoadMore: Record<string, string>;
	    rememberWindow: boolean;
	    rememberScreen: boolean;
	    mouseGestures: boolean;
	    libraryIgnored: string[];
	    localDirs: LocalDir[];
	    folderSeriesOff: string[];
	    fileNameFormat: string;
	    siteFileNameFormats: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.libraryDir = source["libraryDir"];
	        this.pluginSettings = source["pluginSettings"];
	        this.siteDirs = source["siteDirs"];
	        this.autoDownload = source["autoDownload"];
	        this.deleteFilesOnUnbookmark = source["deleteFilesOnUnbookmark"];
	        this.downloadConcurrency = source["downloadConcurrency"];
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
	        this.siteOrder = source["siteOrder"];
	        this.siteScreenOrder = source["siteScreenOrder"];
	        this.siteScreens = source["siteScreens"];
	        this.siteScreensOpen = source["siteScreensOpen"];
	        this.siteLoadMore = source["siteLoadMore"];
	        this.rememberWindow = source["rememberWindow"];
	        this.rememberScreen = source["rememberScreen"];
	        this.mouseGestures = source["mouseGestures"];
	        this.libraryIgnored = source["libraryIgnored"];
	        this.localDirs = this.convertValues(source["localDirs"], LocalDir);
	        this.folderSeriesOff = source["folderSeriesOff"];
	        this.fileNameFormat = source["fileNameFormat"];
	        this.siteFileNameFormats = source["siteFileNameFormats"];
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
	    icon: string;
	    dir: string;
	    browse?: BrowseSpec;
	    fromURL: boolean;
	    ownFavorites: boolean;
	    favoriteNames: boolean;
	    fileNameFormat: string;
	    status: boolean;
	    login: boolean;
	    version: string;
	    hosts: string[];
	    loadMore: string;
	
	    static createFrom(source: any = {}) {
	        return new SiteInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.favorites = source["favorites"];
	        this.icon = source["icon"];
	        this.dir = source["dir"];
	        this.browse = this.convertValues(source["browse"], BrowseSpec);
	        this.fromURL = source["fromURL"];
	        this.ownFavorites = source["ownFavorites"];
	        this.favoriteNames = source["favoriteNames"];
	        this.fileNameFormat = source["fileNameFormat"];
	        this.status = source["status"];
	        this.login = source["login"];
	        this.version = source["version"];
	        this.hosts = source["hosts"];
	        this.loadMore = source["loadMore"];
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
	
	export class StatusLine {
	    label: Record<string, string>;
	    value: string;
	    max?: string;
	    note?: string;
	    warn?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new StatusLine(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.label = source["label"];
	        this.value = source["value"];
	        this.max = source["max"];
	        this.note = source["note"];
	        this.warn = source["warn"];
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
	
	
	
	export class ViewAction {
	    id: string;
	    label: Record<string, string>;
	    icon?: string;
	    active?: boolean;
	    confirm?: Record<string, string>;
	    items?: ViewAction[];
	
	    static createFrom(source: any = {}) {
	        return new ViewAction(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.icon = source["icon"];
	        this.active = source["active"];
	        this.confirm = source["confirm"];
	        this.items = this.convertValues(source["items"], ViewAction);
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
	export class ViewHeader {
	    owner?: string;
	    title: string;
	    subtitle?: string;
	    text?: string;
	    image?: string;
	    actions?: ViewAction[];
	
	    static createFrom(source: any = {}) {
	        return new ViewHeader(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.owner = source["owner"];
	        this.title = source["title"];
	        this.subtitle = source["subtitle"];
	        this.text = source["text"];
	        this.image = source["image"];
	        this.actions = this.convertValues(source["actions"], ViewAction);
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

