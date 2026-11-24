[![en](https://img.shields.io/badge/lang-en-blue.svg)](README.md)
[![ru](https://img.shields.io/badge/lang-ru-green.svg)](README.ru.md)

# Quiet Thread Dots

Choose which successful turns show an unread dot for each thread in bb. The same preference controls whether the thread contributes an unread dot to the macOS Dock, including while the bb window is hidden.

## Install

```sh
bb plugin install https://github.com/SergeyZh/bb-plugin-quiet-thread-dots
```

Tested with bb 0.50.1 and Plugin SDK 0.6.157. The plugin targets bb’s built-in sidebar.

## Choose a mode

Open the thread’s **⋯ → Unread dot** menu.

| Mode | When the dot appears |
| --- | --- |
| **All completions** | bb uses its usual unread indicator. This is the default. |
| **With a final reply** | An unread turn with a written final reply shows a dot. A successful turn with empty final output stays quiet. |
| **Hide dot** | The thread’s successful completions stay quiet. |

For example, a build monitor can finish silently when a build passes and write a summary when it fails. With **With a final reply**, that summary gets a dot. Writing “Build passed” also counts as a final reply.

The filter preserves bb’s read state. An earlier reply that bb still considers unread keeps its dot. When you enable the filter on a thread that already has a dot, the plugin hides it immediately if it can verify a single unread, successful turn with empty output.

Errors and requests for input keep their usual indicators. Other unread threads still contribute to the Dock badge, and requests for input still show a count. Push notifications, unread sorting and collapsed group indicators follow bb’s own settings. The plugin stores selected thread IDs, modes and result timestamps on the bb server.

## Development

With Node.js 24 and the bb CLI installed, run these commands in the repository root.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

To try a local change, run `bb plugin install .` from the same directory.

## License

[MIT](LICENSE)
