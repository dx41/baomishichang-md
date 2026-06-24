# Vue 组件结构参考

## 课程页（刷学时）

组件路径：`document.querySelector('#app').__vue__` → depth 2-3

```
app.__vue__
  └─ Preview (root component)
       └─ bmCourseDetail
            └─ bmMain
                 └─ course  ← 核心组件，包含刷学时方法
```

### 组件方法（course 组件）

| 方法 | 用途 | 参数 |
|------|------|------|
| `postStudyRecord(item, callback)` | 上报学习进度 | item: 视频资源对象, callback: 回调 |
| `getStudyStatus(item, callback)` | 刷新显示状态 | 同上 |
| `handleChangeTab(index)` | 切换 tab | 0=保密优良传统, 1=知识技能, 2=纪律教育 |
| `handleClick(child)` | 展开/折叠手风琴 | child: 子分类对象 |

### 组件属性

- `courseList` - 课程数据结构
  - `courseList.children[0]` → 保密优良传统教育（1 子类，6 视频）
  - `courseList.children[1]` → 保密知识技能教育（4 子类，21 视频）
  - `courseList.children[2]` → 保密纪律教育（2 子类，14 视频）
  - 每个 child 有 `.children[]`，每个子类有 `.list[]`，视频的 `.resourceType===1`

### 视频资源对象属性

| 属性 | 说明 | 设置值 |
|------|------|--------|
| `resourceType` | 资源类型 | 1 = 视频 |
| `timeLength` | 时长字符串 | "HH:MM:SS" 格式 |
| `studyLength` | 学习时长（秒） | 设为 timeLength 对应的秒数 |
| `studyTime` | 学习时间（秒） | 设为 studyLength + 120 |

## 考试页

组件路径：`document.querySelector('#app').__vue__` → depth 2

### 组件方法

| 方法 | 用途 |
|------|------|
| `saveExamResult()` | 直接提交答卷（跳过确认弹窗，推荐） |
| `submitHandle()` | 提交（需确认弹窗，不稳定） |
| `getExamInfo()` | 获取考试信息 |
| `getRandomExam()` | 随机出题 |

## 证书页

组件路径：`document.querySelector('#app').__vue__` → depth 2-3

### 组件方法

| 方法 | 用途 |
|------|------|
| `initCert()` | 初始化证书数据 |
| `getCertRecord()` | 获取证书记录 |
| `saveCert()` | 保存证书信息 |
| `downloadCert()` | 下载证书（PNG） |

## Element-UI 组件操作

- **选项组**：`.el-radio-group`（每道题一个 group）
- **单个选项**：`.el-radio`（每个选项）
- **选项标签**：`.el-radio__label`（可点击触发 v-model）
- 点击 `.el-radio__label` 比直接 dispatchEvent 更可靠
- 20 个 `.el-radio-group` = 15 单选 + 5 判断
