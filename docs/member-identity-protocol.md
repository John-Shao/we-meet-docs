# 无邮箱身份与成员授权

## 身份约定

云文档登录、首次建号、邀请成员、聊天授权、权限申请及审批、代建文档不能要求用户拥有邮箱或通过邮件接受邀请。

Meet 用户 UUID 用于客户端选人；统一登录 `sub` 用于跨服务识别身份；Docs 用户 UUID 是 Docs 自己的主键。三者不可混用。邮箱只作为可选资料或通知渠道，不按邮箱合并可信 sub，也不生成伪邮箱。

## 添加成员接口

Android 复用通讯录多选，提交 Meet 用户 UUID。Meet 校验有效组织成员身份，从数据库解析真实 sub 和姓名，再调用 Docs S2S 接口。Docs 校验授权人的文档管理权限，按 sub 为首次使用者建立无邮箱账号并直接赋权。

- Meet GET `/api/v1.0/docs/member-access/?doc_id=<uuid>` 返回 `user_ids`，供选择器排除已有成员。
- Meet POST 同路径，请求 `doc_id`、`user_ids`（1–100 人）、`role`（reader/commenter/editor）。返回 `identity:"user_id"`、`role`、`results:[{user_id,status}]`。
- Docs POST `/api/v1.0/documents/member-access/`，仅限 S2S。请求 `doc_id`、`actor_sub`；不带 role 时返回 `member_subs`。写入时另带 `role`、`users:[{sub,full_name}]`，返回 `identity:"sub"`、`role`、`results:[{sub,status}]`。
- 状态为 added/existing/failed。已有直接权限保持原样，重复添加不降级；角色变更走成员管理接口。缺失、重复或协议不匹配的确认不能视为成功，重试只处理未完成用户。
- 客户端不能指定 actor_sub、接收者 sub 或以邮箱代替用户 ID。旧服务不支持接口时明确失败，不回退邮箱邀请。

## 其他流程

票据登录、聊天授权和两个代建文档接口共用可信身份建号逻辑。代建接口 email 可省略、留空或为 null，所有权立即绑定到 sub 对应账号。之后票据/OIDC 登录复用同一身份。

聊天授权保留会话来源与角色聚合规则，后续入群者不会自动获得权限。Android“成员与权限”增加根文档待处理申请，完整读取分页，通过已有 ask-for-access、accept、DELETE 接口批准/拒绝，操作受服务端 abilities 限制，无需邮件。本次不新增推送通知。

PC Web 可选邮箱邀请入口保留；共享后端的首次授权和代建行为改为直接授权，邮箱不再是这些流程的前置条件，Web 布局不变。

## 发布与兼容

发布顺序：Docs 后端 → Meet 后端 → Android APK。本次无需数据库结构迁移。

已有 sub 账号和权限继续使用，不重建。历史待接受邮箱邀请不凭客户端邮箱自动认领，不猜测身份归属；管理员从通讯录选择确定用户重新授权后，可移除历史邀请。

验收覆盖无邮箱首次授权/登录、同邮箱不同 sub、越权拒绝、部分失败重试、已有高权限保护、无邮箱申请批准/拒绝。使用隔离测试数据，不发送真实聊天消息或改变真实文档权限。
