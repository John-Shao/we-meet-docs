# Android 编辑画布协议 v2

此协议用于 `WeMeetApp` WebView 中的编辑画布。普通 Web 的保存策略不变。配套 Android 设计与验收记录位于 `we-meet-android/docs/云文档原生化_复审与功能对齐.md`。

## 编辑画布布局

App 的 `chrome=editor` 模式隐藏整排文档浮动工具栏（分享、评论开关、更多操作），同时移除其占位高度和滚动渐变遮罩。分享、评论和版本入口由原生详情页提供。保留可编辑标题、正文格式工具、评论定位面板及历史版本弹窗；关闭画布仍经过保存确认。此规则只匹配 `data-wemeet-embed="app"` 与 `data-wemeet-chrome="editor"`，普通 Web、Web 内嵌和 `chrome=none/full` 不受影响。

布局规则位于 `src/frontend/apps/impress/src/styles/we-meet.css`，需要重新构建并部署 Docs 前端后生效，无需更新 Android APK。

## 就绪与消息身份

App 每次主页面加载生成新的 `editorInstanceId`。画布完成数据加载、挂载保存协调器后，才响应 hello。App 收到匹配的 ready 前隐藏画布并禁止输入；超时提供重试，不能将没有收到 dirty 当作已经保存。

```json
{"type":"wemeet-host-hello","protocolVersion":2,"docId":"document-uuid","editorInstanceId":"page-uuid"}
```

```json
{"type":"wemeet-editor-ready","protocolVersion":2,"docId":"document-uuid","editorInstanceId":"page-uuid","capabilities":{"saveConfirmation":true,"commentNavigation":true,"versionPreview":true}}
```

这与 `useEmbedShell` 的宿主导航能力握手共用消息名，但有独立的 `protocolVersion: 2` 标记；不会覆盖旧握手的 features。

Web 校验同一个 window、精确 origin、文档及实例。原生校验当前 Docs origin（scheme/host/port）、文档及实例，保存响应还必须匹配 requestId。Web→App 仍只使用 `WeMeetHost.postEvent(JSON)`；App→Web 使用目标为 Docs origin 的 `window.postMessage`。

## 保存退出

```json
{"type":"wemeet-save-now","docId":"document-uuid","editorInstanceId":"page-uuid","requestId":"request-uuid"}
```

每次关闭都走此请求，包括没有本地正文修改的页面。协调器依次：

1. 失焦提交标题/输入法组合文本，并把页面设为 inert。
2. 等待已发起的标题、上传、评论提交和版本恢复操作；标题写入串行，最新失败标题可重试，重试也遵守同一队列。
3. 检查未发表的评论、未完成或失败的附件块、失败的历史恢复。存在这些状态时返回失败，不自动发表评论或重复上传。
4. 调用 `useSaveDoc` 原有的 Y.Doc 保存队列，确认本地变更序号全部持久化；仅收到协作广播不算完成。
5. 成功后保持 inert，直到 App 销毁页面；失败解除 inert，保留画布供继续处理。

```json
{"type":"wemeet-save-result","docId":"document-uuid","editorInstanceId":"page-uuid","requestId":"request-uuid","success":false,"reason":"comment-draft"}
```

Web 整体等待上限 12 秒，App 等待上限 15 秒。失败原因包括 offline、timeout、attachment、comment-draft、version-restore、save。原生超时用 `wemeet-resume-editor`（相同身份和 requestId）解除可能仍在保存的页面输入锁。晚到的回执不关闭页面，用户重试使用新的 requestId。最近 32 个请求结果用于幂等回复。

超时不代表底层请求已经撤销，也不代表协作修改可以撤回。特别是标题重试超时后继续输入，新标题仍必须排在旧请求之后，避免旧结果覆盖新标题。

## 跳转与只读

- 站内链接在 React 点击处理前上报 `wemeet-editor-navigate`（docId、editorInstanceId、url），由原生保存后加载目标。
- Next 程序化路由在 `beforeHistoryChange` 的取消边界拦截，避免树节点等不使用原生 URL 导航的入口绕过保存。版本等同文档查询参数变化不属于离开文档。
- 只读页面也挂载协调器，但正文不可编辑；权限变化时保留同一保存协调器，避免把新的只读实例误当作没有待保存内容。
- 历史恢复继续由 Web 完成 REST 更新及 `revertUpdate`；原生不写正文。恢复期间禁用重复点击，失败保留确认框。

## 兼容与限制

保留 v1 的 dirty/save-now/save-result，供旧 App 使用；v2 消息不会由 v1 处理器重复消费。新 App 遇到旧前端只能显示就绪失败提示，不能先允许编辑再在退出时发现无法确认。

本协议不提供 WebView/Y.Doc 进程死亡后的持久化草稿恢复，也不能替代跨账号权限、真实附件处理和有历史数据的版本恢复验收。服务端版本列表为空时，不能把能力握手成功记为历史恢复通过。
