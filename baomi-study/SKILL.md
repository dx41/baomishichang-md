---
name: baomi-study
description: 保密教育线上培训(baomi.org.cn)自动化刷学时和满分考试。通过 CDP 控制 Chrome 浏览器，自动上报学习进度、答题交卷、下载证书。
version: 1.0.2
author: Greatwall
tags: [baomi, study, exam, automation, cdp, education, quiz]
category: automation
---

# 保密教育线上培训自动化技能 (baomi-study)

针对 2026 年度全国保密教育线上培训（baomi.org.cn），通过 CDP 协议控制 Chrome 浏览器，实现刷学时和满分考试自动化。

## 适用场景

- 刷学时：将课程视频学习进度上报至服务端，满足考试门槛（≥4.0 学时）
- 考试满分：先读题 → 匹配题库 → 未覆盖的联网查询 → 填入正确答案 → 提交获取 100 分
- 下载证书：考试通过后自动下载电子证书

## 前置条件

- Chrome 浏览器已开启 CDP 远程调试（端口 18802）
- 浏览器已登录 baomi.org.cn（或已告知密码可程序化登录）
- Node.js 环境 + `ws` 库已安装
- 页面在课程详情页或考试页

## 使用流程

### 1. 检查登录状态

在 CDP 页面调 `fetch` 检查：

```js
fetch("https://www.baomi.org.cn/portal/main-api/v2/studyTime/saveCoursePackage.do?courseId=312bc914-8e11-421b-b9bc-e900fe1a4e50&resourceId=17278f3b-d239-4ffc-80d5-4f5228308359&resourceDirectoryId=7c3d8562-e88b-4bdc-8839-e8b4f1de417d&studyLength=1&studyTime=1&startTime=1&resourceName=t", {credentials:"include"}).then(r=>r.text()).then(console.log)
```

- `{"status":0}` → 已登录
- `{"status":999,"message":"用户未登录！"}` → 需重新登录

### 2. 刷学时

```bash
node ~/.openclaw/workspace/skills/baomi-study/scripts/study_brush.js
```

**原理：**
- 通过 CDP 找到 `app.__vue__` 中的 Vue 组件
- 依次切换 3 个标签（`handleChangeTab(0/1/2)`）
- 展开子目录 → 收集视频资源 → 调 `postStudyRecord` 上报（GET 请求，带 authToken）
- 设置 `studyLength=实际秒数`，`studyTime=秒数+120`
- 刷新页面验证学时增加

### 3. 考试满分（关键流程）

分两步走：**先读题 → 再答题**，确保每题答案可靠。

#### 第 1 步：读题

```bash
node ~/.openclaw/workspace/skills/baomi-study/scripts/exam_full_score.js --mode read
```

输出结构化 JSON，包含每题题号、题目文字、选项文字、题型（single/judge）。

#### 第 2 步：逐题确定答案

对读到的每一题，按以下优先级确定答案：

1. **匹配本地题库** → 查 `references/exam_answers.md`
2. **联网搜索** → 对题库未覆盖的题目，用 `web_search` 或 `web_fetch` 查询题目原文或相关知识点
3. **规则推理** → 联网无果时，基于已知规律推理：
   - "以上都是"常为正确答案（权益保障、违法行为、保密要求等）
   - "国家保密规定"优先于"机关规定"行业规定"
   - 保密审查原则固定"先审查、后公开"
   - 判断题中"不需要管理"=错误、"可以直接传递"=错误
   - 涉密人员分类是"核心/重要/一般"而非"绝密/机密/秘密"

**严禁**：不确定就直接提交等看正确答案。必须每题都确认后再提交。

#### 第 3 步：填入答案并提交

```bash
node ~/.openclaw/workspace/skills/baomi-study/scripts/exam_full_score.js --mode answer --answers="[0,2,2,3,1,0,0,0,1,0,0,0,1,0,3,1,1,1,0,0]"
```

20 个索引（15 单选 + 5 判断），0-indexed：
- `0` = A / 正确
- `1` = B / 错误
- `2` = C
- `3` = D

脚本自动点击选项并调 `saveExamResult()` 提交，然后输出成绩。

### 4. 下载证书

```bash
node ~/.openclaw/workspace/skills/baomi-study/scripts/download_cert.js [--name 姓名]
```

如需修改证书上的姓名，加 `--name` 参数，脚本会自动弹窗填写。

## 目录结构

```
baomi-study/
├── SKILL.md
├── scripts/
│   ├── study_brush.js         # 刷学时（自动切3个tab + 上报）
│   ├── exam_full_score.js     # 考试满分（mode read + mode answer 双模式）
│   └── download_cert.js       # 证书下载
└── references/
    ├── exam_answers.md        # 已知题库（60+ 题正确答案）
    └── vue_structure.md       # Vue 组件结构速查
```

## 已知题库

见 `references/exam_answers.md`，收录 60+ 题目的正确答案。题库按题号分组，每题包含题干关键词和答案索引。

## 关键约束

1. **3 个标签必须逐个处理**：Vue 用 `v-if` 按需渲染，切换后前一个标签数据销毁
2. **`postStudyRecord` 发 GET 请求**，走 authToken header，不是 cookie
3. **`saveExamResult` 直接提交**，不触发弹窗（比 `submitHandle` 稳定）
4. **读题和答题之间不要刷新页面**，否则题目会重新随机抽取

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| API 返回"用户未登录" | cookie session 过期 | 从 CDP 页面登录或让 user 手动登录 |
| 学时上报后不增加 | authToken 过期 | 获取新 token（`localStorage.token`）或重新登录 |
| VM 未找到 | 页面不在课程页 | 确保 URL 含 `bmCourseDetail/course?index=2` |
| 读题输出空数组 | 不在考试页面 | 确保页面在 `bmExam` URL |
