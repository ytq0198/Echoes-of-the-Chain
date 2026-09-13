# ChainGrade 统一交付目录

本目录不是第二套产品。课程答辩与竞赛提交都从同一仓库、同一 Fabric 网络、同一 API、同一 Web 界面和同一证据索引生成，只因时长和匿名规则采用不同材料编排。

- `common/`：两类交付共用的产品事实、证据索引、功能边界与组员虚拟机环境说明。
- `course/`：课程陈述/演示材料及含团队信息的课程文件。
- `competition/`：匿名函评材料骨架；不得出现学校、指导教师或成员身份。
- `demo/`：服务器预检、启停、隧道和故障回退手册。

## 课程最终提交入口

课程收口统一采用以下文件，不再从历史版本中自行挑选：

- `course/ChainGrade_最终实验报告_LaTeX风格.pdf`：最终实验报告，A4 共 18 页。
- `course/ChainGrade_项目介绍.docx`：项目介绍，共 16 页。
- `course/ChainGrade_课程答辩_重制版.pptx`：最终课程答辩稿，共 25 页，逐页讲稿已嵌入备注。
- `course/demo视频.mp4`：项目演示讲解录屏，用于学生互评和成果展示。
- `course/member-contributions.md`：三人最终分工与 4:3:3 贡献评分。
- `course/课程最终提交清单.md`：打包前逐项核对表。
- `course/ChainGrade_课程答辩深度讲解与问答手册.md`：设计思路、代码原理、实验口径、演示顺序与教师问答准备。

课程原始要求明确将项目演示讲解视频列为必交材料。`course/ChainGrade_课程演示录屏脚本.md` 与实际录屏一同保留，便于教师核对演示路径。答辩讲稿的可编辑版本为 `course/ChainGrade_答辩讲稿_重制版.md`。

可编辑的实验报告正文位于 `course/ChainGrade_最终实验报告.md` 与 `course/ChainGrade_最终实验报告_LaTeX风格.md`。报告以问题、设计原因、实现形式和实测数据为主线，直接引用同一项目的真实 Fabric、自动测试、恢复演练和浏览器截图证据。`course/ChainGrade_课程答辩.pptx` 与名称含“修复版”的 PDF 仅作为历史版本保留，不作为最终提交入口。

组员在新虚拟机中继续开发前，应阅读 `common/ChainGrade_虚拟机开发环境与适配说明.md`，完成其中的版本、端口、基础构建和 Fabric 工作模式检查。

竞赛材料提交前必须执行：

```bash
corepack pnpm delivery:check-anonymity
```

最终导出的 PDF、压缩包还需人工检查文件属性、图片 EXIF、PDF 作者字段和压缩包内 Git 历史；文本扫描不能替代最终人工匿名复核。
