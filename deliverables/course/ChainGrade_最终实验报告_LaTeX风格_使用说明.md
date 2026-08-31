# ChainGrade 实验报告 LaTeX 风格版使用说明

## 1. 交付内容

- `ChainGrade_最终实验报告.md`：原始实验报告，内容和格式均保留。
- `ChainGrade_最终实验报告_LaTeX风格.md`：新增论文式封面、摘要、关键词和目录的排版版本；正文数据与原报告一致。
- `typora-latex-theme/latex-upstream.css`：`Keldos-Li/typora-latex-theme` v0.3.3 官方 Windows 发布包中的浅色主题。
- `typora-latex-theme/chaingrade-latex.css`：本项目入口与覆盖层，保留上游主题并补充封面、A4 页面、图片和表格规则。
- `typora-latex-theme/LICENSE`：上游 GPL-3.0 许可证。

## 2. 在 Typora 中启用

1. 打开 Typora，选择“文件 → 偏好设置 → 外观 → 打开主题文件夹”。
2. 将 `typora-latex-theme` 文件夹中的 `latex-upstream.css`、`chaingrade-latex.css` 和 `LICENSE` 复制到主题文件夹根目录。
3. 重启 Typora，打开 `ChainGrade_最终实验报告_LaTeX风格.md`。
4. 在“主题”菜单中选择 `chaingrade-latex`。
5. 使用“文件 → 导出 → PDF”生成 A4 实验报告。

`chaingrade-latex.css` 通过相对路径导入 `latex-upstream.css`，因此两个 CSS 文件必须放在同一目录。若电脑未安装 Latin Modern Roman，西文字体会回退到 Times New Roman；中文会依次回退到思源宋体、华文宋体或宋体，不影响内容呈现。为了获得最接近 LaTeX 的结果，可安装上游发布包建议的 Latin Modern 字体。

## 3. 排版约定

- 正文采用 10.5pt 衬线字体和两端对齐，适合中文课程报告。
- 一级正文标题使用原报告已有的“1、2、3……”编号，覆盖层关闭了上游自动编号，避免出现“1 1. 团队负责内容”之类的重复编号。
- 封面与摘要/目录之后均设置打印分页；表格、代码块和图片尽量避免跨页断开。
- 封面只使用已知项目资料，没有虚构课程教师、学号或未确认的贡献比例。
- LaTeX 风格版只改变呈现方式；52/52 测试、覆盖率、账本高度、哈希、交易 ID、故障记录和局限性均沿用原报告。

## 4. 来源与许可

排版基础来自 [Keldos-Li/typora-latex-theme](https://github.com/Keldos-Li/typora-latex-theme)，使用版本为 v0.3.3。上游项目采用 GPL-3.0 许可证，随本交付物保留 `LICENSE`；项目自定义规则单独放在 `chaingrade-latex.css`，便于辨认来源和继续维护。
