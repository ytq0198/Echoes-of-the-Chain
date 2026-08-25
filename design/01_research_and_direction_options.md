# 立项调研与候选方向

更新日期：2026-08-25

## 1. 一句话结论

推荐将课程参考题升级为“面向升学与招聘核验的隐私保护型可信学业凭证平台”：学校或院系在 Fabric 联盟链上协同签发和维护成绩凭证，学生持有凭证并按用途最小披露，验证方通过一次性链接或二维码核验真实性、有效状态和披露授权。

该方向不脱离“成绩存证与查询”，同时天然覆盖竞赛强调的安全、隐私、技术创新和应用创新。

## 2. 调研发现

### 2.1 标准与论文

1. W3C Verifiable Credentials Data Model 2.0（2025 年正式推荐）给出了签发者、持有者、验证者三方模型，以及凭证状态、证据、有效期等通用字段。它适合把成绩单从“系统内记录”升级为学生可携带的标准化数字凭证。
2. W3C VC 实现指南将选择性披露分为原子凭证、选择性披露签名、哈希值等路径。统一项目可以先实现可审计的原子声明或加盐 Merkle 承诺，再在后续迭代引入 BBS+/匿名凭证。
3. W3C BBS 密码套件支持多消息签名、选择性披露和不可链接的派生证明，能避免学生每次把整份成绩单交给验证方。
4. EduChain 论文使用 Hyperledger Fabric 解决教育数据可信共享与隐私保护，并研究教育账本的存储优化，说明“教育联盟链”本身可行；但仅做存储优化不足以形成差异化产品。
5. 关于 Fabric 教育记录交换的研究通常使用 Hyperledger Caliper 测试吞吐与延迟。本项目测试报告也应包含读写吞吐、P95 延迟、背书失败、并发验证和隐私泄漏检查。
6. 选择性披露综述指出主流机制可分为隐藏承诺与非交互零知识证明。我们应明确区分“字段隐藏”“阈值证明（如 GPA 不低于某值）”和“多次出示不可关联”，避免夸大安全能力。

### 2.2 开源项目借鉴（只借鉴设计，不复制实现）

| 项目                                                   |   调研时热度 | 可借鉴点                                                  | 不直接照搬的原因                                     |
| ------------------------------------------------------ | -----------: | --------------------------------------------------------- | ---------------------------------------------------- |
| `hyperledger/fabric-samples`                           |   3016 stars | 官方测试网络、Gateway、私有数据集合、状态级背书、账本查询 | 是基础设施样例，不是完整产品                         |
| `WeBankBlockchain/WeIdentity`                          |   1150 stars | DID/VC、选择性披露、可信机构注册的产品模型                | 主要面向 FISCO-BCOS，不满足课程 Fabric 硬约束        |
| `hyperledger/aries-cloudagent-python`                  |    490 stars | issuer-holder-verifier 交互、凭证交换和钱包思路           | 引入完整 Aries 技术栈会显著扩大三人项目范围          |
| `blockchain-certificates/cert-verifier-js`             |    115 stars | 无账号验证页、证书状态与验证结果可解释展示                | 更偏证书锚定，缺少成绩过程和 Fabric 多组织治理       |
| `TasinIshmam/blockchain-academic-certificates`         |     83 stars | 大学、学生、验证方三角色与分享流程                        | Fabric 2.1/Node 12 依赖陈旧，README 明示启动说明过时 |
| `openwallet-foundation-labs/learner-credential-wallet` |     90 stars | 学生钱包、二维码接收/分享、多凭证组合                     | 移动端范围过大，本项目先做响应式 Web 钱包            |
| `hyperledger-labs/learning-tokens`                     |     34 stars | 粒度化评价、评分量规和能力标签                            | Token/NFT 容易偏离成绩管理且竞赛禁止涉币叙事         |
| `anoncreds/anoncreds-rs`                               | 活跃参考实现 | 零知识谓词证明、撤销状态、匿名凭证                        | 密码学集成复杂，适合作为后续增强而非首个里程碑       |

GitHub 热度为 2026-08-25 通过公开 API 获取的快照，仅用于判断社区成熟度，不构成选型的唯一依据。

## 3. 候选方向

### 方向 A（推荐）：ChainGrade - 隐私保护型可信学业凭证

核心场景：学生申请实习、交换、推免或奖学金时，不再上传可被任意传播的完整成绩单，而是向验证方证明“凭证由可信院系签发、未撤销、满足所需条件”，并只披露经本人授权的课程或指标。

业务闭环：

1. 教师录入或批量导入过程成绩。
2. 院系/教务复核，按背书策略签发最终成绩凭证。
3. 错误成绩通过追加版本、作废旧版完成更正，保留完整审计链。
4. 学生在 Web 钱包查看凭证，创建限时、限次、指定用途的披露授权。
5. 用人单位或其他高校扫码核验签发者、完整性、撤销状态和授权范围。
6. 系统生成不含成绩明文的访问回执，学生可撤销后续访问。

推荐的分层隐私实现：

- 第一阶段能力：Fabric 私有数据集合 + 链上哈希/状态 + 加盐 Merkle 字段承诺 + 限时能力链接。
- 后续增强能力：W3C VC 2.0 + BBS+ 选择性披露；在资源允许时增加“GPA/排名达到阈值但不公开精确值”的零知识谓词证明。

优势：紧扣原题；演示链路直观；隐私、安全和多组织治理均可量化测试；同一产品可按里程碑持续增强。

风险：BBS+ 和范围证明的库成熟度、规范兼容性需要尽早做技术尖峰；不能把“链上哈希”等同于隐私。

### 方向 B：CreditBridge - 跨校学分银行与课程互认

核心场景：交换生、辅修和跨校课程的成绩由原学校签发，目标院系依据公开互认规则审核并转换为本校学分，学生和双方机构都能追踪审批依据。

主要功能：机构/课程注册、课程能力标签、成绩凭证签发、等价规则版本化、学分转换申请、多方背书、异议处理和转学分结果核验。

创新点：把单点成绩查询扩展为跨机构协作，借鉴 Comprehensive Learner Record 和粒度化能力标签，突出 Fabric 联盟治理。

优势：区块链必要性最强，社会价值和“跨链/跨域应用创新”叙事好。

风险：业务规则庞大、真实校际数据难获得；三人团队容易牺牲界面和完整性。更适合作为方向 A 的第二阶段扩展。

### 方向 C：GradeTrace - 过程性成绩证据与申诉仲裁

核心场景：围绕作业、实验、考试等评分项记录量规版本、评分人签名、成绩变更和申诉证据，解决最终分数可查但形成过程不可解释的问题。

主要功能：评分方案发布、组件成绩批量登记、双人复核、异常检测、学生申诉、证据授权、仲裁结论和版本追踪。

创新点：从“结果存证”转向“评分过程可验证”，可加入教师/助教分权背书与防止事后修改评分规则的策略。

优势：原创度高、课程内可获得模拟数据、完整业务闭环易讲清楚。

风险：证据文件隐私和链下存储设计较难；面向外部验证者的竞赛传播力弱于方向 A。

## 4. 方向评分矩阵

评分 1-5，5 为最好；“实现风险”分数越高表示越容易控制风险。

| 维度           | 权重 | A 可信学业凭证 | B 学分银行 | C 成绩申诉 |
| -------------- | ---: | -------------: | ---------: | ---------: |
| 课程贴合度     |  20% |              5 |          4 |          5 |
| 竞赛创新/隐私  |  25% |              5 |          4 |          4 |
| 实用性         |  20% |              5 |          5 |          4 |
| 完整交付可行性 |  20% |              5 |          3 |          4 |
| 演示效果       |  10% |              5 |          4 |          4 |
| 实现风险可控   |   5% |              4 |          3 |          4 |
| 加权总分       | 100% |       **4.95** |   **3.95** |   **4.25** |

## 5. 推荐产品边界

建议选择 A 为主线，将 C 中的“成绩版本与申诉证据”作为管理端增强，将 B 的“跨机构核验/学分互认”保留为后续模块。全部能力属于同一个产品、仓库和部署架构，形成清晰的三级迭代路线：

1. MVP：成绩录入、复核、签发、查询、修订/撤销、公开验证。
2. 完整产品里程碑：学生钱包、最小披露、二维码、授权过期、审计看板、完整测试和美观 UI，可用于课程答辩。
3. 深化里程碑：在原项目上加入标准 VC、不可链接选择性披露、阈值证明、跨机构互认、Caliper 与安全攻击实验，以同一项目的最新成果参加竞赛。

## 6. 初步技术架构（待方向确认后冻结）

- 前端：Vue 3 + TypeScript + Vite + Element Plus，响应式三角色工作台。
- 业务后端：Node.js/TypeScript，使用 Fabric Gateway SDK；关系数据采用 PostgreSQL。
- 链码：TypeScript Fabric Contract API；对性能热点再评估 Go 链码，避免初期多语言成本。
- 链网络：Fabric 2.5 系列，两所模拟教育组织 + 一所验证/监管组织，Raft orderer，CouchDB 状态库。
- 隐私：Fabric Private Data Collections、基于 MSP 的访问控制、状态级背书、链下密文、VC/选择性披露模块。
- 部署：Docker Compose；服务器只部署到 `/mnt/localDisk3/weizian/Echoes-of-the-Chain`。
- 测试：Vitest/Jest、Playwright、链码单测、Fabric 集成测试、Hyperledger Caliper、安全与隐私负面测试。

## 7. 决策点

需要队长确认主方向：A、B、C，或“A 为主并吸收 C 的成绩修订/申诉流程”（推荐）。方向确认后再冻结产品名称、角色、MVP 范围和三人分工。

## 8. 主要资料

- CCF 赛制说明：https://btc.ccf.org.cn/competitioncharter
- W3C Verifiable Credentials 2.0：https://www.w3.org/TR/vc-data-model/
- W3C VC Implementation Guidelines：https://www.w3.org/TR/vc-imp-guide/
- W3C BBS Cryptosuite：https://github.com/w3c/vc-di-bbs
- Hyperledger Fabric Samples：https://github.com/hyperledger/fabric-samples
- Hyperledger Fabric Private Data：https://hyperledger-fabric.readthedocs.io/en/release-2.5/private-data/private-data.html
- EduChain：https://doi.org/10.1002/cpe.6330
- Secure exchange and verification of academic records：https://www.inderscience.com/info/inarticle.php?artid=123540
- Selective disclosure mechanisms survey：https://arxiv.org/abs/2401.08196
- Blockchain for Academic Credentials：https://arxiv.org/abs/2006.12665
- Academic certificate Fabric prototype：https://github.com/TasinIshmam/blockchain-academic-certificates
- WeIdentity：https://github.com/WeBankBlockchain/WeIdentity
- Learner Credential Wallet：https://github.com/openwallet-foundation-labs/learner-credential-wallet
- Learning Tokens：https://github.com/hyperledger-labs/learning-tokens
- AnonCreds reference implementation：https://github.com/anoncreds/anoncreds-rs
