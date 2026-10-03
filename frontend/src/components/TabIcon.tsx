import { useApp } from '../state'
import { Icon } from './Icon'

/** Built-in icons a local folder's tab can use */
export const TAB_ICONS = ['folder', 'book', 'books', 'image', 'star', 'heart', 'archive', 'tag', 'user', 'users']

/**
 * An image used as an icon. An SVG is drawn in the text color like the app's own icons (as a mask); other images
 * are shown as they are
 */
export function ImageIcon({ url, size = 20 }: { url: string; size?: number }) {
  if (url.startsWith('data:image/svg')) {
    const mask = `url("${url}") center / contain no-repeat`
    return <span className="image-icon mask" style={{ width: size, height: size, mask, WebkitMask: mask }} aria-hidden />
  }
  return <img className="image-icon" src={url} width={size} height={size} alt="" draggable={false} />
}

/** A local folder's tab icon: a built-in icon, or an image in the icons folder ("file:<name>"; the folder icon if gone) */
export function TabIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  const { localIcons } = useApp()
  if (icon.startsWith('file:')) {
    const f = localIcons.find((x) => x.name === icon.slice(5))
    if (f) return <ImageIcon url={f.url} size={size} />
    return <Icon name="folder" size={size} />
  }
  return <Icon name={TAB_ICONS.includes(icon) ? icon : 'folder'} size={size} />
}
