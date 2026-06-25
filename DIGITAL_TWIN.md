# NEKO.SYNC 数字分身 v0.1

## 当前实现

基础版数字分身由浏览器端 `MotionTwinEngine` 驱动。引擎从摄像头视频中提取连续帧，
通过环境校准建立背景模型，再结合帧差、背景差和最大连通区域提取主体，输出运动中心、
边界、方向、速度、强度、锁定状态和置信度。

所有分析均在本地浏览器完成，不上传原始画面。

## 数据链路

```text
MediaStream 视频
  -> 96 × 54 灰度采样
  -> 环境背景校准
  -> 连续帧差 + 背景差
  -> 最大连通主体区域
  -> 主体锁定与丢失保持
  -> 平滑与动作分类
  -> CSS 数字宠物骨骼动画
```

## 输出契约

```js
{
  timestamp: 1000,
  hasMotion: true,
  x: 0.52,
  y: 0.58,
  deltaX: 0.02,
  deltaY: -0.01,
  speed: 0.34,
  intensity: 0.42,
  confidence: 0.87,
  subjectState: "locked",
  calibrated: true,
  direction: 1,
  action: "walking",
  bounds: {
    x: 0.28,
    y: 0.3,
    width: 0.45,
    height: 0.52
  }
}
```

坐标和尺寸均归一化到 `0-1`。

## 分身映射

| 视觉数据 | 数字分身表现 |
| --- | --- |
| `x` | 舞台横向位置 |
| `y` | 身体上下浮动 |
| `direction` | 身体朝向 |
| `speed` | 行走步态速度 |
| `intensity` | 活跃度 |
| `bounds.height` | 分身大小微调 |
| `confidence` | 同步质量 |
| `subjectState` | 搜索、锁定、短暂丢失等跟踪状态 |
| `action` | 待机、轻微活动、行走、抬头 |

## 环境校准

连接摄像头后点击“校准环境”，保持镜头静止并让宠物暂时离开画面。引擎会采集
18 个背景样本。校准完成后，进入画面的主要运动区域会被持续锁定。

主体状态：

- `searching`：画面中没有稳定主体。
- `acquiring`：检测到主体，正在连续确认。
- `locked`：主体已稳定锁定。
- `holding`：短暂丢失，保留上一姿态避免分身跳变。
- `calibrating`：正在采集背景，暂停动作输出。

## 当前边界

背景建模可排除静止家具和零散噪声，但仍不能区分宠物、人或其他大型移动物体。因此它
已经是由真实摄像头主体驱动的数字分身，但还不是宠物语义姿态模型。

下一阶段应以宠物关键点模型替换 `MotionTwinEngine` 的检测部分，同时保持输出契约不变。
这样渲染层无需重写即可获得头部、脊柱、四肢和尾巴的真实骨骼数据。

## 桌面分身

控制台通过 `POST /api/twin/state` 发布精简动作状态。本地服务使用
`GET /api/twin/events` 的 Server-Sent Events 推送给原生 macOS 悬浮窗。

桌面应用位于 `dist/NEKO.SYNC Desktop Pet.app`，使用透明 `NSPanel` 和
`WKWebView` 渲染。窗口始终置顶、跨桌面显示，并可拖动到屏幕任意位置。

## 母版猫骨架

当前标准母版骨架为 `assets/master-cat/cat.blend`。这是可编辑的 Blender 源文件，
保留完整控制器、`rig`、`metarig` 和制作数据。项目同时导出一份干净运行时资产：
`assets/master-cat/master-cat.glb`，只包含真实猫网格 `tmp07h_6s3zobj` 和被网格使用的
`rig` 骨架，避免把 `WGT-*` 控制器形状混入浏览器运行时。

母版检查报告保存在 `assets/master-cat/master-cat.report.json`。当前报告显示：

- 源文件包含 274 个 mesh 对象，其中运行时只导出 1 个真实猫网格。
- 源文件包含 2 套 Armature：`rig` 为 760 根骨骼，`metarig` 为 174 根骨骼。
- 源文件暂未包含 baked Action 动画；动画继续复用现有 `maomao#0001` 动作库。
- glTF 导出会将每个顶点的骨骼影响限制为前 4 个，这是浏览器运行时兼容要求。

服务端通过 `GET /api/twin/3d/master` 暴露当前母版信息，并提供：

- `GET /api/twin/3d/master/model`：下载干净版母版 GLB。
- `GET /api/twin/3d/master/report`：查看骨架/网格检查报告。

后续用户真实猫模型应先归一化到该母版骨架比例，再进行自动权重、骨骼重定向和 IK 修正。

## AI 身份融合资产

身份化不再采用静态摄影测量网格，而使用“参考照片 -> AI 材质身份图 -> 可动分件骨架”：

```text
猫咪参考照片
  -> 浏览器本地裁切与压缩
  -> OpenAI Images API 图像编辑
  -> 毛色、花纹、眼周对比等身份特征
  -> 赛博毛发、石墨装甲、荧光电路材质图
  -> HTML/CSS 分件骨架
  -> 行走、卧下、蹦跳等动态
```

生成结果保存在 `.generated/ai-fusion.jpg`。实时状态只同步
`/api/twin/fusion/image?v=<版本>`，避免通过 SSE 重复传输大型图片。

身份材质使用固定 2x2 atlas：左上为头部身份花纹，右上为身体低频花纹，左下为耳部与
颈部材质，右下为四肢和尾巴装甲。渲染层只在头部保留高辨识度特征，身体继承大块毛色，
四肢以机械结构为主，避免同一张照片在各部件重复铺贴。

下一阶段可加入猫脸自动裁切、身份一致性评分和多候选选择。
