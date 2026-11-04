# vfs-ui 接口与组件

## 模块边界

浏览器维护展示和交互，不拥有编辑器。本包仅依赖 vfs-core；Heading、TaskCounts、菜单、标签编辑器和文件创建等消费方契约由本包公开。宿主实现相同结构即可接入，无需 common/ui-common。默认 SVG、基础工具和中英文主要控件文案包含在包内；presentation 可按实例覆盖翻译、图标与启动跟踪。状态通过路径复制保持不可变，不依赖 immer。

编辑器连接、媒体预览、Markdown 元数据解析、mention 来源与编辑器选择位于 app-shell 的 `src/browser/`。设置页通过 `FileBrowserConnector` 注入连接器，不向上依赖 app-shell。vfs-ui 的 FileTypeRegistry 仅处理图标、解析器配置与复制转换，不持有 EditorFactory。

## 简明入口

### 通用目录内容页

`createDirectoryList(options)` 创建不绑定文件系统的目录视图，接收资源条目 `entries`（稳定 `id`、名称、类型、大小及时间），通过 `open`、`refresh`、`actions`、`contextMenu`、`favorite`、`select`、`bulkActions` 和 `search` 接入宿主能力。批量操作使用宿主声明的任意动作 ID、图标、权限回调及执行回调；库不解释项目、会话或业务路径。

默认列依次为名称、大小、修改时间、类型、创建时间，支持列头排序及拖拽/键盘调整列宽。`created` 接收毫秒时间戳或日期字符串，缺失或无效时显示“—”；窄屏通过表格横向滚动查看全部列。

`presentation` 按实例注入 `t`、`locale`、`icons`、`fileIcon`、`entryType` 和异步 `trace(operation, work)`；未注入时使用内置英文文案和图标。图标是宿主可信标记，资源名称始终按文本渲染。业务搜索通过 `search.element/controls/setQuery/refresh` 接入，不在库内读取后端或决定检索范围。

`refreshDirectoryList(element)` 刷新已有视图，`refreshDirectorySelection(element)` 同步宿主选择，`relocateDirectoryList(element, path, title, breadcrumbs)` 更新移动后的目录身份与面包屑，丢弃旧路径的迟到刷新结果。上述函数接受目录元素或其容器。`createDirectoryBreadcrumbs(items, open, presentation)` 可独立挂载面包屑。宿主负责文件变更订阅、路由、标签窗口、业务服务和销毁订阅；DOM/CSS 及响应式布局由库维护，样式包含在公共 `style.css` 中。

### 可复用抽屉

`Drawer` 是不依赖文件系统的布局组件，可用于资源、智能体或已打开窗口等独立列表。它只管理标题、折叠、搜索框与动作挂载，不定义列表数据、过滤规则、网络请求或业务操作。

```ts
const drawer = new Drawer({
  title: 'Resources',
  collapsed: false,
  search: {
    label: 'Filter resources',
    visible: true,
    onChange: query => renderFilteredResources(query),
  },
  mountActions: container => mountResourceActions(container),
});
sidebar.append(drawer.element);
drawer.content.append(resourceList);
```

省略 `search` 或传 `false` 时不创建搜索框；`search.visible` 和 `setSearchVisible()` 控制已配置搜索框的显示，隐藏不清空查询。`setQuery()` 用于同步宿主查询，不触发 `onChange`，避免反馈循环。异步查询的取消和过期结果校验由宿主负责。

`search.mountLeading` 可在搜索框左侧同一行挂载可信宿主控件并返回清理函数；搜索显隐覆盖整行，销毁时释放控件。

`mountActions` 接收可信宿主控件的挂载容器，可返回清理函数；`destroy()` 解绑事件并执行清理，即使清理抛错也移除组件 DOM。内容由宿主创建和释放，组件不推断内容的生命周期。移动抽屉 DOM 不重建输入、查询或内容实例。

`showHeader: false` 可用于已有标题栏的列表或弹层，标题仍作为可访问名称；此时不调用 `mountActions`。`collapsible: false` 固定展开。默认由 `content` 滚动；宿主内容已有滚动容器时使用 `scrollMode: 'host'`，保持标题和搜索区固定。宿主通过公开变量 `--vfs-drawer-border/background/accent` 调整外观，不依赖内部 DOM 或 CSS 类名。

### 资源浏览器

```ts
const browser = createVFSBrowser({
  container,
  source: fromVFS(fs, { root: '/notes' }),
  title: 'Notes',
  sort: { by: 'title', direction: 'asc' },
  actions,
  onActivate: node => openResource(node.resource),
  onError: error => showError(error),
});
await browser.start();
```

`VFSBrowser` 提供 `start/reveal/expand/setQuery/select/refresh/getSelection/getSelectionMode/setSelectionMode/getSnapshot/destroy`。此入口默认单列、不自动选中、不写 localStorage，也不为自定义数据源注册文件写操作。

触屏宿主可通过 `BrowserOptions.selection: true` 或 `VFSToolbarOptions.selectionToggle: true` 开启常驻“多选”按钮，也可调用 `setSelectionMode(true)`，从零选中状态显示复选框与批量操作栏；点击行只切换选择，不激活资源。底部取消或 `setSelectionMode(false)` 退出并清空选择。选择机制属于浏览器，删除与移动仍通过宿主动作校验和执行；手机批量按钮与复选框有至少 44px 的触摸区域。

普通列表默认将搜索、常用图标动作与更多菜单放在同一行，宿主无需重复配置；已有外围标题时设置 `appearance.showTitle: false`。显式 `navigationHeader.layout: stacked`、`toolbar: compact` 与 `toolbarContainer` 保留自定义布局。图标动作保留 title 和 aria-label，多选入口可由宿主选择是否提供。

`BrowserSource` 只有 `get(id, signal?)`、`children(parentId, signal?)`、`subscribe(listener)`。ID 是不可解析的显示身份，父链来自 parentId。BrowserNode 的 `kind` 明确区分 file/directory/group，`resource?: { viewId, path }` 是真实资源引用。分组没有默认文件动作；源范围由 fromVFS 的 root 限定，实际读写权限仍由 IFileSystem 校验。

SourceAdapter 将公开节点映射到内部展示模型，支持懒加载、展开恢复、变化订阅与取消。全量刷新先准备已加载分支（含未展开的投影容器），完成后一次发布；等待及失败保留旧树，展开状态以用户当前操作为准。搜索当前已加载条目，不隐式扫描整个文件系统。

### 动作

```ts
const archive = {
  id: 'archive',
  label: 'Export JSON',
  placements: ['toolbar', 'menu', 'selection'],
  state: context => ({ visible: true, enabled: context.selection.length > 0 }),
  run: async (context, signal) => exportSelection(context.selection, signal),
};
```

`ActionContext` 包含 selection/target/parent。动作拥有业务确认和执行；UI 在执行时检查可用性。同一列表的 ActionRunner 合并同 ID 的进行中操作、报告异步错误，并在销毁时发出 AbortSignal。宿主异步操作须遵守 signal；UI 无法撤销已提交的领域写入。

工具栏、菜单、行内删除与底部批量操作共享执行边界。高级入口的旧菜单配置仍可用；底部批量按钮与拖拽会检查宿主菜单策略，不能通过另一入口绕过已移除的操作。固定排序下禁止 before/after 拖拽重排。异步 CommandBus 返回 Promise，调用方可以等待完成或拒绝。

### 删除与移动的公共执行机制

`createSelectionOperation` 是删除和移动共用的执行核心。宿主 `resolve` 返回有序批次（`ids` + `execute`）；核心在确认前按真实资源身份跨批次去重，依次执行，取消或异常立即停止，全部成功后调用 `completed`。ID 在一次操作内必须唯一标识真实资源（跨视图时包含 viewId），不能使用同一资源的不同展示节点 ID。异常交给既有 ActionRunner 报告；核心不另建锁或吞掉错误，也不回滚已经提交的写入。

- `createDeleteOperation`：宿主提供 `resources` 和可选 `containers` 批次，每批通过 `remove` 返回 `completed` / `cancelled`。所有资源删除成功后才执行容器删除，空抽屉也可以只提供容器批次。
- `createMoveOperation`：调用参数为 `{ selection, destination }`；宿主解析完整来源、校验目标并提供执行批次。目标可以是文件目录、抽屉名或其他领域身份，公共层不解析路径，也不推测移动分组是否意味着移动其内容。
- 两者都支持异步 `confirm`、成功回调 `completed` 和 AbortSignal。取消后不启动下一批或刷新；已经提交的操作无法撤销，宿主内部的长异步步骤也应遵守 signal。
- 文件单删、批删、文件移动及工具箱抽屉操作复用上述机制；实际权限与目标有效性仍由服务端口／领域服务校验。

```ts
const move = createMoveOperation<string[], string>({
  resolve: (ids, destination) => ({ batches: [{
    ids,
    execute: async paths => {
      await files.move(paths, destination);
      return 'completed';
    },
  }] }),
  completed: () => browser.refresh(),
});
// Use inside a BrowserAction.run or another existing ActionRunner boundary.
await move({ selection: selectedResourceIds, destination: targetId }, signal);
```

完整删除目标必须来自数据源或宿主目录，不能依赖渲染树的 children、当前搜索结果或展开状态。分组是否删除、Provider 关联影响确认、文件递归删除和抽屉归属变更均由适配器定义。UI 不将 group 默认解释为可递归删除的目录。

## 文件工作台高级入口

`directoryPreview(node)` 可返回目录初始显示的子项数；不配置时显示全部。双列导航可单独配置 `columns.navigationDirectoryPreview`。超过数量后提供“显示更多／收起”；展开后的子列表限制高度并独立滚动，收起按钮固定在底部；当前项、选中项及其祖先仍可见，搜索时不截断结果。限制仅作用于呈现，原始树、选择范围和导出不变，展开状态在当前组件生命周期内保留。

若完整列表由宿主页面呈现，可返回 `DirectoryPreviewOptions`：`{ limit: 15, moreLabel: '更多条目', open: directory => openDirectory(directory.id) }`。此模式先筛选、排序再截取，搜索和选中均不突破数量上限；超出时显示按钮，由宿主打开完整目录，不在原列表展开。`open` 接收原目录身份，同一目录的进行中操作去重，失败通过 `onError` 报告并允许重试。该限制仅影响当前列表的呈现，不改变数据源或其他目录视图。

`createVFSUI(options, fs)` 返回 `VFSUIShell`。`VFSUIOptions` 是 `VFSUIShellOptions` 的别名，只有一份配置声明；Shell 不再继承 ISessionUI。

常用配置：

| 配置 | 用途 |
| --- | --- |
| sessionListContainer、title、searchPlaceholder | 容器与文案；保留既有参数名 |
| fileCreation、fileTypes、defaultExtension | 普通文件创建、图标与复制行为 |
| source | 可选自定义 BrowserSource；设置页已采用 VFS source adapter |
| listItems、cardDirectory、listHeader | 宿主投影、抽屉外观、附加筛选条 |
| sort、compareItems | 固定排序及宿主排序；选择条目不会改变固定排序 |
| contextMenu、toolbarOptions | 文件工作台已有菜单与工具栏扩展 |
| favoriteAction、onQuickDelete | 宿主行级动作：收藏状态/切换与虚拟条目的删除执行 |
| columns | 项目工作台的双列布局配置；省略时单列 |
| persistence、scopeId | 是否持久化及实例命名空间；旧文件工作台默认保留持久化 |
| onError | 操作错误报告 |

`favoriteAction` 是宿主持久化的收藏端口：`state(node)` 在渲染期查询（返回 `undefined` 隐藏控件，必须无副作用），`toggle(node)` 在用户激活后执行。`onQuickDelete(node)` 只对声明 `presentation.quickDelete` 的条目生效，未提供时回退到普通文件删除。

### 行级写入策略

策略与机制分离：`utils/row-policy.ts` 是唯一的策略来源，`resolveRowPolicy(viewReadOnly, node)` 产出 `RowPolicy`（`readOnly` / `fixed` / `inlineDelete` / `hostOwnedDelete`）。renderer、`BaseNodeItem`、右键菜单、拖拽门禁与行处理器只消费该结果；DOM 侧的数据属性名由 `ROW_FLAGS` 统一发布，避免渲染与拖拽各自硬编码。

规则：只读来自视图级 `readOnly` 或节点 `_readOnly`；`_fixedEntry` 和 `_disabled` 条目没有行内删除；文件默认开启行内删除，`presentation.quickDelete: false` 可关闭。虚拟目录通过 `presentation.quickDelete` 显式开启，并因此把删除交给 `onQuickDelete`（未提供时回退 `file:delete`）。`resolveQuickDeletePolicy` 同时消费普通文件的当前菜单删除权限，使渲染、手势与执行保持一致；显式开启的宿主删除保留其独立授权语义。`resolveColumnReadOnly` 让只读的内容根（离线挂载、历史树）整列只读——注意这同时关闭该列的排序与批量选择，宿主需要排序时应提供 `compareItems`。

NodeList 内置左滑删除，不需要调用者添加手势监听。Pointer Events 支持触屏、笔和鼠标；移动达到 10px 后锁定方向，横向必须超过纵向的 1.5 倍，左移至少 48px 展开、右移至少 32px 收起。纵向手势不阻止原生滚动，方向锁定后不再转向；滑动后的 click/dblclick 会被拦截，新的 pointerdown 开始正常点击。原生鼠标拖拽开始时取消手势，保留文件拖放。

左滑入口默认隐藏，只在同一列表的一行展开。首次点击显示确认图标，再次点击才执行；与原行内两步删除共享确认状态、RowMutationPort 和 ActionRunner 去重，不追加菜单确认。原桌面悬停入口及菜单保持原交互。`presentation.icons.delete` 和新增的 `presentation.icons.confirm` 注入两种图标，按钮名称复用 `action.delete` / `vfs.action.confirmQuickDelete` 翻译。右滑、Escape、点击已展开行正文或外部可收起；切换行、行被筛走或权限撤销会清除确认，刷新仍可保留有效的展开行。销毁通过 AbortSignal 移除全部手势及 document 监听。

删除失败保留条目并沿用已有具体原因提示，确认重置后可重新两次点击重试。行级诊断 `[vfs-ui:row-delete]` 记录 operationId、阶段、结果、错误类别及耗时，省略路径、正文及参数。宿主删除记录实际成功或拒绝；普通文件沿用已有命令内的失败报告，行级日志仅记 `dispatched`，不据此宣称业务删除成功。

右键菜单的收藏项进入默认菜单后再交给宿主 `contextMenu.items` 过滤，因此宿主菜单策略仍是唯一权威；收藏读写宿主元数据而非资源本身，只读条目同样可以收藏。选择属于视图级语义，行级只读只限制修改（拖拽、删除、重命名、移动）。

Shell 提供 `getNode/updateNodeMetadata/getQuery/setQuery/setSelection/setExpanded/getSnapshot`，宿主不再访问 store.dispatch。getQuery 包含仍在搜索防抖中的文字，setQuery 取消旧防抖并同步搜索框，供宿主组合筛选条件；销毁取消待执行的搜索。getSnapshot 仅返回冻结的 activeId/query/selectedIds/expandedIds，不暴露内部 Store、可变 Set 或缓存。

`presentation.tagLabel(tag)` 可将稳定的标签 ID 格式化为用户可读的文案；renderer 按文本转义，查询的 `tag:` token 和持久身份保持原值。

`selectPath` 定位并激活；`expandPath` 仅展开。自定义 source 根据 parentId 寻找祖先，标准文件 adapter 处理路径。后台刷新保留当前选择与已展开分支。

双列使用 `setContentRoot/getContentRoot/setContentVisible/showColumn` 控制右列和窄屏显示。每列独立搜索和选择，节点保留原身份；上层决定项目、文件入口和会话家族如何投影。`backLabel` 由宿主决定，缺省为通用“返回”。

`columns.navigationAction` 是固定导航动作：除 `label/icon/visible/disabled/active/run` 外，`afterChildId(parentPath)` 返回同级子条目的资源 ID，使动作固定在该子条目之后（缺省或未命中时追加到末尾）；`placement: 'after-first'` 保持原有语义。

## 展示信息

VFSNodeUI 是高级文件视图的展示模型，保留原 metadata/content 字段以兼容现有投影；新数据源使用精简 BrowserNode。两者由 SourceAdapter 转换，不能把显示 ID 当成文件路径。

`presentation` 包含通用 subtitle/badges/attention/unread。应用将 Agent 连接标签、任务数量、等待输入状态转换为这些显示字段；renderer 不再识别 `.agent` 或解释 HITL。`setNodeAttention(id, label?)` 控制提示标记。

## 生命周期与样式

持久化使用带 version 的 UI 状态记录，兼容旧无版本记录；相同快照不重复写入。简明入口默认关闭持久化，避免实例共享默认选择状态。

高级入口的 `VFSUIOptions.navigationChildren(node)` 为 `listItems` 投影声明当前展开节点需要加载的直接子容器 ID。单栏和双栏共用展开、启动恢复和刷新链路；容器只加载 children，不自动展开，也不预读折叠分支。顶层配置优先于兼容的 `columns.navigationChildren`。显式 `loadDirectory(path)` 仍可按需加载单个容器并向宿主报告失败。

基础 reset 限定在 `.vfs-ui` 范围，弹出菜单也设置该作用域，独立 ScopeSelector 使用自己的组件类；不修改宿主 body、全局按钮或列表。宿主通过公开展示选项和 CSS 变量定制，不能依赖内部 DOM 类名或覆盖内部组件选择器。

### 展示、抽屉与导航通知（0.5.4）

- `appearance.showTimestamp` 默认显示时间戳，设为 false 只改变该实例；`appearance.menuVisibility` 可选择 hover 或 always。行创建按钮的尺寸、悬停、键盘聚焦及触屏显示由本包样式负责。
- `VFSNodeUI.presentation.layout: 'drawer'` 将目录呈现为抽屉；`titleLayout: 'stacked'` 将标题和描述上下排列。BrowserSource 对应字段为 `BrowserNode.presentation` 和 `titleLayout`。现有 `cardDirectory` 回调仍兼容，并优先于节点声明。
- `shell.setExpanded(id, expanded)` / `browser.expand(id, expanded)` 控制展开，`shell.on('directoryExpansionChanged', callback)` / `browser.onExpansionChange` 通知实际状态变化，包含手动操作、程序调用及同级抽屉自动收起；重复设置相同状态不通知。宿主仍拥有分组成员、排序与业务动作。
- `shell.on('resourceActivated', callback)` 只通知用户激活（单击、按配置双击、键盘），不因程序选择/恢复、复选框或折叠操作触发。原 `sessionSelected` 保持选择和恢复语义。两种事件均不执行宿主命令。
- 宿主布局可在外围容器订阅冒泡 DOM 通知 `VFS_DOM_EVENTS.resourceActivated` 和 `directoryExpansionChanged`，其 `CustomEvent.detail` 与 shell 事件相同。移动端列表/正文切换不需要查询内部行类名。双列返回使用已有 `showColumn('navigation')`。
- `toolbarOptions.variant: 'plain'` 提供嵌入宿主标题栏的紧凑无边框操作；ScopeSelector 自带样式、键盘焦点与等待态。
- 默认工具栏按新建文件、新建目录、刷新、导入、导出排序（`directoryFirst` 仅交换两个新建按钮），调用 `VFSUIShell.refresh()` 重新读取列表并保留展开状态；只读目录仍可刷新，进行中禁用按钮并合并重复点击。`hiddenActions: ['refresh']` 可隐藏，`actions.refresh` 可覆盖默认执行；显式 `items` / `definitions` 仍完全决定工具栏内容。图标可通过 `presentation.icons.refresh` 替换，文案为 `vfs.toolbar.refresh`。

公开 CSS 变量可设在宿主自己的容器上并继承：`--vfs-item-icon-size`（SVG 默认 18px）、`--vfs-toolbar-icon-size`（16px）、`--vfs-toolbar-gap`（4px）、`--vfs-toolbar-margin-top`（8px）、`--vfs-title-bar-gap`（6px）、`--vfs-secondary-action-min-height`（0）、`--vfs-secondary-action-font-size`（11px）、`--vfs-scope-height`（34px）、`--vfs-scope-font-weight`（400）、`--vfs-scope-background`（transparent）。plain 工具栏固定无顶部间距。

## 实现入口

- `src/browser/Browser.ts`：简明 facade。
- `src/contracts/source.ts`、`src/browser/actions.ts`：数据源、节点和动作契约。
- `src/browser/from-vfs.ts`、`src/browser/SourceAdapter.ts`：读取适配。
- `src/shell/VFSUIShell.ts`、`Assembler.ts`：文件工作台装配。
- `src/interaction/ActionRunner.ts`、`CommandBus.ts`：异步执行。
- `src/services/VFSStore.ts`、`StatePersistence.ts`：状态与快照。

### 行操作的内部边界

- `handlers/RowMutationPort.ts`：行内删除和拖拽的命令适配器；执行时重新解析节点，拒绝失效目标，明确宿主删除与普通文件删除的路由。
- `DirectoryActions.ts`：目录按钮的 DOM、锚点、激活展示与进行中状态；通过 `ActionRunner` 执行并报告错误，刷新列表不会重新开放仍在执行的按钮。
- `utils/row-policy.ts` 的 `allowsRowAction`：单项/批量内置操作的统一权限判断。宿主菜单可隐藏或替换呈现；未提供执行回调的内置命令不能绕过只读或固定条目策略。显式 `onClick` 是宿主生命周期端口（例如删除只读工具箱投影所代表的资源），由宿主授权并执行，不回退到通用文件命令。
- `ContextMenuHandler`：菜单呈现和调度，在执行前读取最新节点和菜单配置；底层资源权限仍由 VFS 校验。
- `ColumnState.commands()`：投影列的命令转发必须返回原命令的 Promise，使上层执行器能够等待完成、合并重复动作及报告失败。

渲染器在任意行策略变化时重建节点，而非只监听只读变化；资源 ID 按数据比较，避免把文件名当作 CSS 选择器解释。

## 宿主目录详情菜单

`VFSUIShell.showItemMenu(event, path)` 允许宿主在宽目录详情行上打开原有节点菜单。VFS 来源只按目标路径读取节点，不要求侧栏可见，不展开父目录或加载兄弟条目；执行前再次读取节点，删除或权限变化会阻止过期动作。`contextMenu.mapItem` 将单个资源转换为与列表一致的展示类型，业务映射仍由宿主提供。权限判定与执行仍经过原有 row-policy、ContextMenuHandler 与命令管线。

`doubleClickActivation(node)` 可指定仅双击打开的条目：单击仍更新选择，折叠箭头、勾选框和菜单独立处理；目录标题按 Enter 也可打开。未配置时保持原有单击行为。项目工作台对项目目录开启此策略。目录改名只调用 `driver.rename`，目录标题由名称派生；文件仍保留标题元数据同步与失败回滚。

宿主目录详情以 `getSnapshot().selectedIds` 为选择来源，通过 `setSelection(ids)` 回写，并订阅 `stateChanged` 更新勾选与全选状态。页面刷新、筛选及重新打开列表仍从同一来源恢复，避免正文和侧栏各自持有选择状态。

宿主可用 `titleHeader` 替换标题行；插槽自动占满可用宽度且不额外添加内边距，宿主负责标题内容的布局与留白。通过 `toolbarContainer` 将原有工具栏控件挂到宿主标题区（保留事件、上下文和权限检查），使用 `rowCreation` 在可写目录行提供创建图标；执行前重新检查同一 row-policy。`allowsBulkAction` / `runBulkAction` 复用 ContextMenuHandler 的批量菜单过滤、删除确认与移动选择器，宿主不直接操作 store 或复制授权逻辑。

普通侧栏默认使用统一标题和搜索动作行：新建文件、新建目录、根目录、刷新及声明为 toolbar 的宿主动作直接显示；有图标的动作默认仅显示图标。导入导出在所有宽度进入更多菜单，保留原控件、权限与等待状态。`toolbarOptions.inlineActions`、`overflowActions`、`iconOnlyActions` 可显式覆盖；自定义 stacked、compact 和 toolbarContainer 保持其布局契约。

外围宿主已显示列表名称时，可设 `appearance.showTitle: false` 隐藏标准标题行；`titleHeader` 自定义标题保留。抽屉标题固定单行，过长时省略并通过 title 提供完整名称。

`toolbarOptions.root` 可为默认工具栏提供根目录导航的 `label`、`title` 和异步 `run()`，入口显示在刷新按钮之前，复用工具栏的动作错误处理。自定义 `items` / `definitions` 仍完整决定工具栏内容。

宿主目录详情与已打开列表通过 `getResourceIcon(node)` 复用节点显式图标、已注册文件类型图标及默认图标；图标容器使用 `file-type-icon` 复用资源浏览的浅色/深色主题配色。公共 `formatFileSize(bytes)` 提供 B、KiB、MiB 等易读大小，未知大小显示破折号。

宿主目录详情的导出、复制到、移动到、删除调用 `allowsBulkAction` / `runBulkAction`，与右键菜单共用过滤和执行逻辑。“复制到”保留源文件并复用目标选择器；“复制副本”仍是原有单目录副本操作。目标选择器等待命令返回的 Promise，执行期间阻止重复确认，失败时保留目标并显示原因。

`transferPolicy.source(node, mode)` / `destination(node, ids, mode)` 决定传输入口和可选目录；宿主可用 `transferItems(mode, ids, destination)` 将投影身份适配到授权文件视图。默认复制使用 vfs-core 的 `transferFileSystemEntry`。这些展示策略不替代底层文件系统权限校验。

## Shared actions and scope selection

`toolbarOptions.definitions` supplies one `VFSActionDefinition` per host command. Each definition owns its label, trusted `iconHTML`, placement (`toolbar`, `menu`, `both`, `hidden`, or a context callback), disabled predicate and asynchronous `run(context, signal)`. The same definition renders in toolbars and resource menus; legacy `items` / `actions` remain supported. Definitions take precedence over legacy toolbar rendering. Host context-menu filtering remains authoritative.

`VFSActionContext.origin` distinguishes toolbar and menu entry points. Toolbar context uses selection, then the active row; menu context targets exactly its resource (`selectedIds: [target.id]`) and uses a directory itself or a file's parent as `parentPath`. Placement and disabled state are checked again before execution. The list shares its ActionRunner across both entry points, awaits the returned promise, prevents concurrent calls of the same action ID and reports a failure once through `onError`. Host predicates and application commands remain responsible for domain authorization.

`ScopeSelector` provides an accessible select element. Hosts call `update(options, currentId)` and implement asynchronous `select(id, signal)`. Pending selection disables the control; settlement restores the latest host-supplied value, so failed choices do not replace the current scope. `destroy()` aborts its signal and detaches its listener. Project names, creation entries and scope projection belong to the host. Drawer-style directory presentation remains available through `cardDirectory` / BrowserSource presentation; it does not impose project semantics.


### Deferred expansion

`VFSUIShellOptions.deferExpansion: true` makes `start()` return after root data and selection are ready, then restores the saved expanded branch in a later task. Closing the shell cancels the scheduled task. A folder folded during restoration stays folded and its descendants are not read. The default keeps synchronous restoration. This mechanism uses the injected source and does not depend on an application runtime or transport.

菜单项可设置 `iconOnly: true`，同时提供 `iconHTML`；名称保留在 title/aria-label，无图标时回退文字。全图标菜单自动采用 44px 点击区域的紧凑网格，图标保持 18px。


### 紧凑工具栏布局与排序

`VFSToolbarOptions.compactLayout` 显式选择 `menu`（默认）或 `inline`；`primaryAction` 指定 inline 模式保持可见的主操作。`extraItems.placement` 只决定扩展动作是否进入更多菜单，`extraItems.after` 只决定排序。添加固定按钮不会隐式切换工具栏结构，`setToolbar` 可更新布局和主操作并释放旧布局监听。

### 窗口管理入口

`createVFSUI`、`VFSUIShell` 和 `createVFSBrowser` 均接受可选的 `windowManagement`。提供 `open(origin)` 回调时，标准标题栏显示统一窗口图标；未提供则不显示。`count()` 和 `subscribe(changed)` 可提供动态数量，组件销毁自动解绑。`open` 由宿主打开窗口管理界面，返回焦点及窗口数据、切换、关闭和草稿保护仍归宿主。隐藏标题但提供回调时，保留操作行，避免入口不可达。

```ts
windowManagement: {
  open: origin => windowManager.open(origin),
  count: () => windowManager.count(),
  subscribe: changed => windowManager.subscribe(changed),
}
```

外围标题栏可通过公开 `createWindowManagement(options, presentation)` 复用同一控件；返回 `button`、`update()` 与幂等 `destroy()`。`presentation.icons.windows` 覆盖图标，`windowManagement.label` 覆盖文案。库不保存应用窗口或包含特定业务路由。

资源行标题统一使用 `formatDisplayLabel(text)`，超过 40 个字素时以省略号结尾；宿主的窗口列表也可复用此公开函数。短名称保留原文，支持字素分段的浏览器不拆开组合字符；旧浏览器回退到 Unicode 码点。该函数只处理显示文本，完整名称继续用于搜索、tooltip、可访问名称与重命名，资源身份不变。

### 通用侧栏与筛选弹层

`Sidebar({container, title, state, changed, windowManagement, presentation})` 管理导航页签、键盘切换、内容节点保留和宽度拖拽。`navigation` 是初始内容槽，`addDrawer(kind, label, body, toggle)` 添加互斥视图；`selectView` 切换，`setViewChanged` 观察。`state` 仅含可选 `width/view`，`changed` 将展示状态交给宿主保存。辅助内容可传入隐藏的 `auxiliary` 槽；有窗口回调时统一显示入口。公开根类为 `vfs-sidebar`，宽度通过 `--vfs-sidebar-width` 控制；宿主不应依赖内部元素或样式。

`FilterPanel({label, iconOnly, iconHTML}, presentation)` 提供 `trigger/summary/content` 公共槽及 `update(chips)`、`destroy()`。宿主仅向 `content` 添加业务筛选控件，并为每个 chip 提供 `label/remove()`；库负责文本转义、弹层定位、手机布局、展开状态及关闭后的焦点恢复。

普通 inline 导航在搜索获得焦点后，将原行内按钮与筛选入口临时移入同一更多菜单，使搜索框占满菜单以外的宽度；离开该行后恢复原控件位置。菜单保留所有原事件、状态与权限检查，不复制按钮。工具栏更新、筛选及列表刷新保留此模式；`navigationHeader.expandSearch: false` 可显式关闭。

### 逻辑资源删除

createVFSBrowser 的 BrowserNode.deletable 开放资源删除。deletion.preview 返回影响说明、阻碍、选择项和不透明 data，deletion.remove 接收已确认的快照和选择集合；宿主仍需在提交时核验状态。deletion.confirm(node, preview, signal) 可替代默认共享弹窗，返回选择集合表示确认，undefined 表示取消。默认弹窗和自定义 callback 二选一，blocked 预览即使被自定义 callback 确认也不会执行删除。

createVFSUI 的 confirmDelete(node):Promise<boolean> 供行内删除替换第二步确认。提供时第一次点击删除即调用 callback，不再要求点行内确认图标；未提供则继续原两次点击。返回 false 保留资源，返回 true 才执行 onQuickDelete 或普通文件删除。onQuickDelete 是删除生命周期回调，不应再重复询问。
