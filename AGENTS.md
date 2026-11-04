# @nestos/vfs-ui

文件/资源浏览 UI — `createVFSBrowser`、`VFSUIShell`、`VFSService`、数据源与动作契约。

`Drawer` 提供独立于文件系统的可折叠分区、可选搜索与 `mountActions` 生命周期。查询和业务回调属于宿主；移动同一组件不重建搜索或内容，宿主内容的销毁仍由宿主负责。用法见 [组件文档](./doc/components.md#可复用抽屉)。虚拟 group 菜单执行前从当前 listItems 投影重新核对；真实文件继续从授权 driver 重读，不能用旧展示节点回退已删除文件。

## 命令

```bash
pnpm --filter @nestos/vfs-ui build        # vite build
pnpm --filter @nestos/vfs-ui dev          # vite build --watch
pnpm --filter @nestos/vfs-ui test         # vitest run
```

## 结构

```
src/
├── shell/          ← VFSUIShell、双列布局、Assembler (DI)
├── services/       ← VFSService, VFSStore, EngineAdapter, NodeMapper,
│                     FileTypeRegistry
├── ui/             ← NodeList, FileOutline, MoveToModal, TagEditor 及 items/handlers/popovers
├── contracts/      ← types (VFSNodeUI/VFSUIState/UISettings), ports, commands, events,
│                     persistence (UISnapshot / UIPersistencePort / localStorage adapter)
├── interaction/    ← CommandBus, ActionRunner, EventBus, handlers/(File/Bulk/Navigation/
│                     Selection/UI/Import/Export/CustomMenu CommandHandler)
├── browser/        ← Browser、fromVFS、SourceAdapter、actions
└── utils/          ← helpers, row-policy（读写策略唯一来源）, node-sort,
                      delete-guard, fixed-entry, delete-error, error-detail, adapter-debug
```

## 约定

- `createVFSUI(options, engine)` — 工厂函数,返回 `VFSUIShell` 实例（不继承 ISessionUI）
- 编辑器连接、媒体预览、mention 及 Markdown 元数据策略位于 `app-shell/src/browser/`，不在本包。
- 本包仅依赖 vfs-core。消费方契约在 contracts/ 定义；通过结构兼容接口接收宿主能力，禁止重新引入 common/ui-common 或其他业务包。
- 翻译、图标和启动跟踪经 presentation 按实例注入；内置默认值保证无宿主适配时也能使用。
- presentation.tagLabel 只格式化标签的显示文案，不改变 tag 身份、搜索语法或持久化内容，返回值继续按文本转义。
- 宿主使用语义 API，不能访问内部 store.dispatch。
- getQuery() 包含仍在防抖中的输入文字；setQuery() 取消旧防抖任务并同步搜索框，供宿主组合标签筛选，不能在稍后恢复旧查询。后台状态更新保留尚未提交的搜索文字，销毁取消防抖任务。
- 内部 DOM/CSS 类名不是宿主契约。展示使用 appearance、NodePresentation、toolbarOptions.variant 和公开 CSS 变量；资源激活与展开变化通过公开事件及 VFS_DOM_EVENTS 通知。抽屉是目录的展示形式，分组成员和业务动作由宿主提供。
- 行级读写策略只在 `utils/row-policy.ts` 定义（`resolveRowPolicy` / `resolveColumnReadOnly` / `ROW_FLAGS`）；renderer、右键菜单、拖拽与行处理器都是机制，禁止各自重新推导 `_readOnly` / `_fixedEntry` / `quickDelete`。
- 虚拟目录可通过 `presentation.quickDelete` 开启两步行内删除；`onQuickDelete(node)` 接入宿主生命周期，在第二次确认后执行。未提供回调时走普通文件删除；固定入口及只读条目不开放。行内控件的两次点击本身就是确认，第二次点击直接进删除管线，不再复用右键菜单动作（否则会再问一次）；菜单与批量删除各自的确认保持不变。右键菜单策略独立于显式开启的行内操作，且收藏项进入默认菜单，宿主仍可过滤。
- 收藏是宿主持久化的状态：`favoriteAction.state(node)` 只读（返回 `undefined` 隐藏控件），`favoriteAction.toggle(node)` 执行；本包不保存收藏。
- `directoryPreview` 返回数字时保留列表内展开；返回 `{limit, moreLabel, open}` 时严格限制筛选、排序后的可见子项，由宿主打开完整列表。预览不改变原始数据、资源身份或选择/导出范围，库不包含项目与会话规则。
- 状态更新由 VFSStore + services/state-update.ts 完成：只复制被修改节点及其祖先，复用未变分支、Set 和配置；无变化不通知 state 订阅者，action hook 仍先执行。
- 节点操作经 `VFSService`(createFile / createDirectory / renameItem / updateMultipleItemsTags 等),事件经 `contracts/events.ts` 的映射表处理

详情: [组件 + Options](./doc/components.md)

文件树的 `.gitignore` 过滤属于 UI 展示，位于 `utils/gitignore-visibility.ts`；默认不额外排除 node_modules 等目录，不更改原始 VFS、工具或服务端行为。合成导航使用 `hideGitignored: false`，实际文件通过宿主注入的展示回调过滤；规则变更重新加载已展开分支。

- 行内删除/移动通过 `RowMutationPort` 分派；目录按钮由 `DirectoryActions` 管理进行中状态。菜单呈现不是授权，执行前通过 `allowsRowAction` 和最新节点重新检查。
- 左滑删除由 `SwipeDeleteHandler` 统一委托 Pointer Events；只展开入口，复用 quickDelete 确认与删除管线。普通文件的显示与执行共用 `resolveQuickDeletePolicy` 核对当前菜单权限；宿主不得复制手势。阈值与生命周期见组件文档「行级写入策略」。
- 内置「新建文件/新建目录」的目标目录：有选中时取首个选中项（目录→自身，文件→其父目录），否则取**当前激活行**（同上），再退回列根。激活一行会清掉单条选中，所以不能只看 `selectedItemIds`——否则"点开一个文件夹再新建"会落到列根。宿主给同名动作提供了自定义 `actions` 时仍以宿主语义为准。
- `FileSystemView` 把 provider 消息统一成 `Source operation failed: <method>`，原文只在 `cause` 里。面向用户的报错路径（`CommandBus` 日志、`ActionRunner` 默认 reporter、宿主 report）统一用 `utils/error-detail.ts` 的 `describeErrorReason()`（日志可用 `describeCauseChain()`） 取最内层原因，否则「跨项目移动」这类可操作解释永远不会显示。

- `listItems` 投影可以生成不属于文件树的行身份；原始文件树刷新不能据此删除投影行的选择和展开状态。无投影时仍对失效路径进行清理。

- VFSUIShell.loadDirectory 只为已存在节点加载 children，保留节点折叠及兄弟目录展开状态，供宿主将隐藏容器成员投影到导航；加载失败向调用方拒绝且允许重试，不包含项目或会话语义。

- `showItemMenu` 的 VFS 目标从授权 driver 按路径解析，不能依赖侧栏可见性或展开状态；执行前重新读取节点及权限。`contextMenu.mapItem` 仅注入宿主的单项展示映射，库不识别项目/Session 路径。菜单项 `iconOnly` 保留 title/aria-label，缺少图标时显示名称。

- 手机和触屏工具栏将现有导入/导出控件移入更多菜单，宽屏恢复原位置，不复制动作和权限状态；菜单支持 Escape、点击外部和执行后关闭。`appearance.showTitle: false` 供已有外围标题的宿主隐藏标准标题行；抽屉标题单行省略，自定义标题布局仍由宿主负责。

NodePresentation.indicators 是宿主提供的通用语义图标（icon 为文本、label 为说明），默认与文件标题同行展示；indicatorPlacement:subtitle 可放在副标题旁，muted 仅灰显而不禁用操作，不受 showTags/showBadges 影响。图标与说明均转义，保留 role/img、aria-label 和 title；库不解释模型等业务能力。NodePresentation.showTags=false 可单独隐藏该行标签，仍保留标签的搜索与筛选行为。

NodeList 的 navigationHeader 插槽接收主操作、筛选、摘要、结果与可选共享菜单容器；次要操作移动原按钮到菜单，不复制动作。宿主负责搜索和业务状态，库只管理统一布局与响应式展示。

VFSToolbarOptions.extraItems 允许在默认文件工具栏追加宿主动作，事件经既有 actions 回调派发；placement:overflow 在宽屏和触屏始终收进已有更多菜单，iconOnlyActions 可指定纯图标并保留 title/aria-label，不内置业务动作。

extraItems.after 指定宿主动作紧跟的工具栏动作；overflowActions 可将内置低频动作在所有屏幕宽度下固定收进更多菜单，保留原按钮事件与权限状态。

紧凑工具栏通过 compactLayout:menu/inline 显式选择布局，通过 primaryAction 独立选择 inline 主操作；extraItems.after 只表达排序，不推导布局或主操作。运行中 setToolbar 更新布局时释放旧菜单监听并沿用动作派发。

普通列表默认将搜索与常用图标动作同行，导入/导出进入更多菜单；显式 stacked、compact 和 toolbarContainer 保留独立布局。createVFSBrowser 透传 navigationHeader 与 toolbarOptions(variant/iconOnlyActions/inlineActions)，宿主只声明动作而不重复默认布局配置。

windowManagement 提供 open 回调时显示统一窗口列表入口；count/subscribe 可选，用于刷新数量并在销毁时解绑。窗口数据、弹窗和生命周期归宿主，vfs-ui 不识别 Session、看板或应用路由。createWindowManagement 是外围标题栏复用同一控件的公开入口。

Sidebar 管理互斥导航页签、键盘焦点、保留内容节点、宽度调整及可选窗口入口，changed 只交出展示状态，存储由宿主负责。FilterPanel 管理筛选弹层、标签移除、响应式位置与焦点，宿主通过 content 公共槽挂业务控件。组件 DOM/CSS 均由本库维护，宿主不得复制内部样式。

inline 搜索聚焦时由 ToolbarOverflow 将原按钮与筛选槽临时移入同一更多菜单，失焦离开行后恢复。刷新保留搜索模式，不克隆动作；expandSearch:false 可关闭。宿主不实现焦点收起或移动内部控件。

- `directory/` 提供不绑定文件系统的通用目录内容页、工具栏、多选、面包屑和列宽调整；通过 `createDirectoryList` 注入资源、搜索、动作、展示及诊断端口。项目/Session 类型、业务路径、文件变更订阅及窗口生命周期留在宿主。表格最后一列为创建时间，窄屏横向滚动保留所有列。样式归 `styles/directory.css`。

删除确认按入口只执行一次：行内提供 confirmDelete(node):Promise<boolean> 时，它替代默认的第二次行内点击；返回 false 不调用删除。未提供时保留默认两次点击。onQuickDelete 只承担已确认后的资源生命周期。createVFSBrowser 的 deletion 提供资源预检和删除端口，deletion.confirm 可替代默认的共享确认弹窗（返回选择集合，undefined 取消）；行内和菜单共用预检与确认，不叠加两种确认。BrowserNode.deletable 显式开放逻辑资源的生命周期删除，不创建重复文件正文。

严格 `directoryPreview` 可注入 `read(directory)` 获取已筛选、排序的有界预览；EngineAdapter 仅在需要读取该目录时调用，未打开目录不读取。宿主提供最多 limit+1 项判断溢出，完整页面仍按原目录身份读取全部/分页内容；库不推导应用的存储查询。

BrowserDeletionPreview.details accepts optional plain-text diagnostics with a caller-provided label. Default confirmation renders them in a collapsed details element using textContent; business providers supply names and explanations without replacing the shared confirmation flow.
