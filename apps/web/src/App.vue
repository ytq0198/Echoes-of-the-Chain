<script setup lang="ts">
import type { PublicAppealRecord, PublicCredentialRecord } from '@chaingrade/shared';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type View = 'home' | 'issuer' | 'reviewer' | 'student' | 'verify';
type RequestState = 'idle' | 'loading' | 'success' | 'error';

interface VerificationResult {
  credentialId: string;
  authentic: boolean;
  valid: boolean;
  status: PublicCredentialRecord['status'];
  issuerMspId: string;
  version: number;
  updatedAt: string;
  transactionId: string;
}

const demoSubjectHash = 'e21b5e0c1a136d1c910aea031527936cb024a4ea95ea1a236b5383056d466926';
const demoCourseHash = 'b'.repeat(64);
const views: View[] = ['home', 'issuer', 'reviewer', 'student', 'verify'];
const currentView = ref<View>('home');
const mobileMenuOpen = ref(false);

const issuerState = ref<RequestState>('idle');
const issuerMessage = ref('');
const issuedRecord = ref<PublicCredentialRecord>();
const issuerForm = ref({ credentialId: 'cred:2026:web01', subjectHash: demoSubjectHash, courseHash: demoCourseHash, schemaVersion: '1.0', courseName: '区块链技术与应用', score: 92, grade: 'A', salt: 'CHAIN_GRADE_DEMO_2026' });
const amendmentState = ref<RequestState>('idle');
const amendmentMessage = ref('');
const amendedRecord = ref<PublicCredentialRecord>();
const amendmentForm = ref({ previousCredentialId: 'cred:2026:web01', credentialId: 'cred:2026:web01-v2', schemaVersion: '1.0', courseName: '区块链技术与应用', score: 95, grade: 'A', salt: 'CHAIN_GRADE_AMEND_2026' });
const reviewerCredentialId = ref('cred:2026:web01');
const reviewerState = ref<RequestState>('idle');
const reviewerMessage = ref('');
const reviewRecord = ref<PublicCredentialRecord>();
const appealReviewState = ref<RequestState>('idle');
const appealReviewMessage = ref('');
const appealReviewRecord = ref<PublicAppealRecord>();
const appealReviewForm = ref({ appealId: 'appeal:2026:web01', decision: 'ACCEPTED' as 'ACCEPTED' | 'REJECTED', summary: '核验原始实验记录后，同意进入成绩修订流程。', salt: 'CHAIN_GRADE_RESOLUTION_2026' });
const studentCredentialId = ref('cred:2026:real01');
const studentState = ref<RequestState>('idle');
const studentMessage = ref('');
const studentRecord = ref<PublicCredentialRecord>();
const appealState = ref<RequestState>('idle');
const appealMessage = ref('');
const submittedAppeal = ref<PublicAppealRecord>();
const appealForm = ref({ appealId: 'appeal:2026:web01', reason: '实验成绩未计入总评，请复核原始评分记录。', salt: 'CHAIN_GRADE_APPEAL_2026' });
const verifyCredentialId = ref('cred:2026:real01');
const verifyDetailHash = ref('ebc3ed396f7fba90bd55c28ed6233ac446b164bd0cade67435494980cb5e128e');
const verifyState = ref<RequestState>('idle');
const verifyMessage = ref('');
const verification = ref<VerificationResult>();

const viewLabel = computed(() => ({ home: '项目总览', issuer: '教师签发台', reviewer: '复核工作台', student: '学生凭证夹', verify: '公开验真' })[currentView.value]);

function viewFromHash(): View {
  const candidate = window.location.hash.replace(/^#\/?/, '') as View;
  return views.includes(candidate) ? candidate : 'home';
}
function syncHash(): void { currentView.value = viewFromHash(); mobileMenuOpen.value = false; window.scrollTo({ top: 0, behavior: 'smooth' }); }
function openView(view: View): void { window.location.hash = `#${view}`; }
function scrollToAppeal(): void { document.getElementById('appeal-form')?.scrollIntoView({ behavior: 'smooth' }); }
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : `请求失败（${response.status}）`);
  return payload as T;
}

async function submitCredential(): Promise<void> {
  issuerState.value = 'loading'; issuerMessage.value = ''; issuedRecord.value = undefined;
  try {
    issuedRecord.value = await requestJson<PublicCredentialRecord>('/api/v1/credentials/drafts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credentialId: issuerForm.value.credentialId, subjectHash: issuerForm.value.subjectHash, courseHash: issuerForm.value.courseHash, schemaVersion: issuerForm.value.schemaVersion, details: { salt: issuerForm.value.salt, courseName: issuerForm.value.courseName, score: Number(issuerForm.value.score), grade: issuerForm.value.grade } }) });
    reviewerCredentialId.value = issuerForm.value.credentialId; issuerState.value = 'success'; issuerMessage.value = '草稿已提交至 Fabric，等待独立复核。';
  } catch (error) { issuerState.value = 'error'; issuerMessage.value = error instanceof Error ? error.message : '提交失败'; }
}
async function submitAmendment(): Promise<void> {
  amendmentState.value = 'loading'; amendmentMessage.value = ''; amendedRecord.value = undefined;
  try {
    amendedRecord.value = await requestJson<PublicCredentialRecord>(`/api/v1/credentials/${encodeURIComponent(amendmentForm.value.previousCredentialId)}/amendments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credentialId: amendmentForm.value.credentialId, schemaVersion: amendmentForm.value.schemaVersion, details: { salt: amendmentForm.value.salt, courseName: amendmentForm.value.courseName, score: Number(amendmentForm.value.score), grade: amendmentForm.value.grade } }) });
    reviewerCredentialId.value = amendmentForm.value.credentialId; studentCredentialId.value = amendmentForm.value.credentialId; amendmentState.value = 'success'; amendmentMessage.value = '修订草稿已创建；原凭证保持 ACTIVE，直至新版本独立复核通过。';
  } catch (error) { amendmentState.value = 'error'; amendmentMessage.value = error instanceof Error ? error.message : '修订提交失败'; }
}
async function loadForReview(): Promise<void> {
  reviewerState.value = 'loading'; reviewerMessage.value = '';
  try { reviewRecord.value = await requestJson<PublicCredentialRecord>(`/api/v1/credentials/${encodeURIComponent(reviewerCredentialId.value)}`); reviewerState.value = 'success'; }
  catch (error) { reviewerState.value = 'error'; reviewerMessage.value = error instanceof Error ? error.message : '查询失败'; }
}
async function approveCredential(): Promise<void> {
  reviewerState.value = 'loading'; reviewerMessage.value = '';
  try { reviewRecord.value = await requestJson<PublicCredentialRecord>(`/api/v1/credentials/${encodeURIComponent(reviewerCredentialId.value)}/approve`, { method: 'POST' }); reviewerState.value = 'success'; reviewerMessage.value = '复核通过，凭证状态已更新为 ACTIVE。'; }
  catch (error) { reviewerState.value = 'error'; reviewerMessage.value = error instanceof Error ? error.message : '复核失败'; }
}
async function loadAppealForReview(): Promise<void> {
  appealReviewState.value = 'loading'; appealReviewMessage.value = '';
  try { appealReviewRecord.value = await requestJson<PublicAppealRecord>(`/api/v1/appeals/${encodeURIComponent(appealReviewForm.value.appealId)}`); appealReviewState.value = 'success'; }
  catch (error) { appealReviewState.value = 'error'; appealReviewMessage.value = error instanceof Error ? error.message : '申诉查询失败'; }
}
async function resolveAppeal(): Promise<void> {
  appealReviewState.value = 'loading'; appealReviewMessage.value = '';
  try { appealReviewRecord.value = await requestJson<PublicAppealRecord>(`/api/v1/appeals/${encodeURIComponent(appealReviewForm.value.appealId)}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision: appealReviewForm.value.decision, resolution: { summary: appealReviewForm.value.summary, salt: appealReviewForm.value.salt } }) }); appealReviewState.value = 'success'; appealReviewMessage.value = '申诉结论已写入公共承诺，结论明文已进入组织私有集合。'; }
  catch (error) { appealReviewState.value = 'error'; appealReviewMessage.value = error instanceof Error ? error.message : '申诉处理失败'; }
}
async function loadStudentCredential(): Promise<void> {
  studentState.value = 'loading'; studentMessage.value = '';
  try { studentRecord.value = await requestJson<PublicCredentialRecord>(`/api/v1/credentials/${encodeURIComponent(studentCredentialId.value)}`); studentState.value = 'success'; }
  catch (error) { studentState.value = 'error'; studentMessage.value = error instanceof Error ? error.message : '查询失败'; }
}
async function submitAppeal(): Promise<void> {
  appealState.value = 'loading'; appealMessage.value = ''; submittedAppeal.value = undefined;
  const credentialId = studentRecord.value?.credentialId ?? studentCredentialId.value;
  try { submittedAppeal.value = await requestJson<PublicAppealRecord>(`/api/v1/credentials/${encodeURIComponent(credentialId)}/appeals`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appealId: appealForm.value.appealId, details: { reason: appealForm.value.reason, salt: appealForm.value.salt } }) }); appealReviewForm.value.appealId = appealForm.value.appealId; appealState.value = 'success'; appealMessage.value = '申诉已由学生属性证书提交，理由明文未进入公共账本。'; }
  catch (error) { appealState.value = 'error'; appealMessage.value = error instanceof Error ? error.message : '申诉提交失败'; }
}
async function verifyCredential(): Promise<void> {
  verifyState.value = 'loading'; verifyMessage.value = ''; verification.value = undefined;
  try { const query = verifyDetailHash.value ? `?detailHash=${encodeURIComponent(verifyDetailHash.value)}` : ''; verification.value = await requestJson<VerificationResult>(`/api/v1/credentials/${encodeURIComponent(verifyCredentialId.value)}/verify${query}`); verifyState.value = 'success'; }
  catch (error) { verifyState.value = 'error'; verifyMessage.value = error instanceof Error ? error.message : '验真失败'; }
}
function shortHash(value: string): string { return `${value.slice(0, 10)} ··· ${value.slice(-8)}`; }
function formatTime(value: string): string { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
onMounted(() => { currentView.value = viewFromHash(); window.addEventListener('hashchange', syncHash); });
onBeforeUnmount(() => window.removeEventListener('hashchange', syncHash));
</script>

<template>
  <main>
    <nav class="nav shell" aria-label="主导航">
      <a class="brand" href="#home" aria-label="ChainGrade 首页"><span class="brand-mark" aria-hidden="true">CG</span><span>ChainGrade</span></a>
      <div class="desktop-nav"><a href="#issuer">教师签发</a><a href="#reviewer">独立复核</a><a href="#student">学生凭证</a><a class="nav-verify" href="#verify">公开验真</a></div>
      <button class="menu-button" type="button" aria-label="切换导航" @click="mobileMenuOpen = !mobileMenuOpen">{{ mobileMenuOpen ? '关闭' : '菜单' }}</button>
      <div v-if="mobileMenuOpen" class="mobile-nav"><a href="#issuer">教师签发</a><a href="#reviewer">独立复核</a><a href="#student">学生凭证</a><a href="#verify">公开验真</a></div>
    </nav>

    <template v-if="currentView === 'home'">
      <section class="hero shell">
        <div class="hero-copy"><div class="live-chip"><span></span> FABRIC 2.5 LTS · REAL LEDGER CONNECTED</div><p class="eyebrow">ECHOES OF THE CHAIN</p><h1>成绩可信，<br /><span>披露有界。</span></h1><p class="lead">同一个项目贯通课程答辩与竞赛深化。教师提交、院系复核、学生持有和公开验真，都在一条可追溯的证据链上。</p><div class="hero-actions"><button class="button primary" type="button" @click="openView('issuer')">进入角色工作台</button><button class="button secondary" type="button" @click="openView('verify')">立即公开验真</button></div></div>
        <aside class="proof-card" aria-label="真实凭证状态示例"><div class="proof-topline"><span>ACADEMIC CREDENTIAL</span><span class="active-dot">● ACTIVE</span></div><div class="proof-seal">✓</div><p class="proof-label">区块链技术与应用</p><p class="proof-title">已通过可信机构复核</p><dl><div><dt>公开账本</dt><dd>状态与哈希承诺</dd></div><div><dt>精确成绩</dt><dd>隐式私有集合</dd></div><div><dt>当前版本</dt><dd>v1 · ACTIVE</dd></div></dl><div class="hash-line">tx 52ddff39 ··· b7fd9b5a4</div></aside>
      </section>
      <section class="role-section shell" aria-labelledby="role-heading"><div class="section-heading"><div><p class="eyebrow">ONE PRODUCT · FOUR VIEWS</p><h2 id="role-heading">每个角色，只看到应当看到的。</h2></div><p>角色分离不是界面装饰，而是由 Fabric CA 属性证书和链码权限共同约束。</p></div><div class="role-grid">
        <button type="button" class="role-card issuer-card" @click="openView('issuer')"><span>01 / ISSUER</span><h3>教师签发台</h3><p>录入成绩详情，以 transient data 提交，明文不进入公共状态。</p><b>创建成绩草稿 →</b></button>
        <button type="button" class="role-card" @click="openView('reviewer')"><span>02 / REVIEWER</span><h3>独立复核台</h3><p>核对公共承诺与业务信息，提交者无法用同一证书自审。</p><b>查看待复核 →</b></button>
        <button type="button" class="role-card" @click="openView('student')"><span>03 / STUDENT</span><h3>学生凭证夹</h3><p>查看凭证当前状态、版本与更新时间，为后续申诉和披露授权提供入口。</p><b>查看我的凭证 →</b></button>
        <button type="button" class="role-card verify-card" @click="openView('verify')"><span>04 / VERIFIER</span><h3>公开验真</h3><p>无需接触成绩明文，以凭证标识和哈希判断真实性与有效性。</p><b>验证一份凭证 →</b></button>
      </div></section>
      <section class="evidence-section"><div class="shell evidence-grid"><div><p class="eyebrow light">VERIFIED ON REAL FABRIC</p><h2>不是原型截图，<br />是真实交易闭环。</h2></div><dl class="metrics"><div><dt>25</dt><dd>自动测试</dd></div><div><dt>91.32%</dt><dd>链码语句覆盖率</dd></div><div><dt>2</dt><dd>独立组织批准</dd></div><div><dt>20</dt><dd>E2E 后账本高度</dd></div></dl></div></section>
    </template>

    <template v-else>
      <header class="workspace-header shell"><div><p class="eyebrow">CHAIN GRADE WORKSPACE</p><h1>{{ viewLabel }}</h1></div><span class="phase-badge">Iteration 2 · 修订申诉</span></header>
      <section v-if="currentView === 'issuer'" class="workspace shell">
        <div class="workspace-intro"><span class="role-token">ISSUER</span><h2>创建待复核成绩草稿</h2><p>成绩详情会先规范化并计算 SHA-256，再通过 transient data 进入签发组织的隐式私有集合。</p></div>
        <form class="form-panel" @submit.prevent="submitCredential"><div class="field wide"><label for="credential-id">凭证标识</label><input id="credential-id" v-model="issuerForm.credentialId" required /></div><div class="field"><label for="course-name">课程名称</label><input id="course-name" v-model="issuerForm.courseName" required /></div><div class="field"><label for="score">成绩</label><input id="score" v-model.number="issuerForm.score" type="number" min="0" max="100" required /></div><div class="field"><label for="grade">等级</label><select id="grade" v-model="issuerForm.grade"><option>A</option><option>B</option><option>C</option><option>D</option><option>F</option></select></div><div class="field"><label for="schema-version">Schema 版本</label><input id="schema-version" v-model="issuerForm.schemaVersion" required /></div><div class="field wide"><label for="subject-hash">学生匿名标识（SHA-256）</label><input id="subject-hash" v-model="issuerForm.subjectHash" class="mono" minlength="64" maxlength="64" required /></div><div class="field wide"><label for="course-hash">课程标识（SHA-256）</label><input id="course-hash" v-model="issuerForm.courseHash" class="mono" minlength="64" maxlength="64" required /></div><div class="field wide"><label for="salt">隐私盐值</label><input id="salt" v-model="issuerForm.salt" class="mono" minlength="16" required /><small>演示数据使用固定合成盐；正式环境必须使用安全随机值。</small></div><div class="form-actions"><button class="button primary" :disabled="issuerState === 'loading'">{{ issuerState === 'loading' ? '正在提交…' : '提交至 Fabric' }}</button><span>复核前状态为 PENDING_REVIEW</span></div><p v-if="issuerMessage" class="notice" :class="issuerState">{{ issuerMessage }}</p></form>
        <article v-if="issuedRecord" class="result-card"><div><span class="status pending">{{ issuedRecord.status }}</span><h3>{{ issuedRecord.credentialId }}</h3></div><dl><div><dt>详情承诺</dt><dd class="mono">{{ shortHash(issuedRecord.detailHash) }}</dd></div><div><dt>交易 ID</dt><dd class="mono">{{ shortHash(issuedRecord.transactionId) }}</dd></div></dl><button class="text-button" @click="openView('reviewer')">交给复核员 →</button></article>
        <section class="operation-panel"><div class="operation-heading"><div><p class="eyebrow">IMMUTABLE AMENDMENT</p><h3>创建不可覆盖的修订版本</h3></div><span>旧版本保持可审计</span></div><form class="compact-form" @submit.prevent="submitAmendment"><div class="field"><label for="previous-id">原凭证标识</label><input id="previous-id" v-model="amendmentForm.previousCredentialId" required /></div><div class="field"><label for="amended-id">新版本标识</label><input id="amended-id" v-model="amendmentForm.credentialId" required /></div><div class="field"><label for="amended-score">修订成绩</label><input id="amended-score" v-model.number="amendmentForm.score" type="number" min="0" max="100" required /></div><div class="field"><label for="amended-grade">修订等级</label><select id="amended-grade" v-model="amendmentForm.grade"><option>A</option><option>B</option><option>C</option><option>D</option><option>F</option></select></div><div class="field wide"><label for="amended-course">课程名称</label><input id="amended-course" v-model="amendmentForm.courseName" required /></div><div class="field wide"><label for="amended-salt">新版本隐私盐值</label><input id="amended-salt" v-model="amendmentForm.salt" class="mono" minlength="16" required /></div><button class="button primary" :disabled="amendmentState === 'loading'">{{ amendmentState === 'loading' ? '正在创建…' : '创建修订草稿' }}</button><p v-if="amendmentMessage" class="notice" :class="amendmentState">{{ amendmentMessage }}</p></form><article v-if="amendedRecord" class="mini-result"><span class="status pending_review">{{ amendedRecord.status }}</span><b>{{ amendedRecord.credentialId }}</b><span>v{{ amendedRecord.version }} · previous {{ amendedRecord.previousCredentialId }}</span><button class="text-button" @click="openView('reviewer')">转交复核 →</button></article></section>
      </section>
      <section v-else-if="currentView === 'reviewer'" class="workspace shell">
        <div class="workspace-intro"><span class="role-token">REVIEWER</span><h2>独立复核公开承诺</h2><p>复核身份与提交身份使用不同证书。当前工作台只展示公共账本字段，不读取成绩明文。</p></div>
        <div class="lookup-panel"><label for="review-id">凭证标识</label><div class="lookup-row"><input id="review-id" v-model="reviewerCredentialId" /><button class="button secondary" :disabled="reviewerState === 'loading'" @click="loadForReview">查询账本</button></div><p v-if="reviewerMessage" class="notice" :class="reviewerState">{{ reviewerMessage }}</p></div>
        <article v-if="reviewRecord" class="review-sheet"><div class="sheet-head"><div><span class="status" :class="reviewRecord.status.toLowerCase()">{{ reviewRecord.status }}</span><h3>{{ reviewRecord.credentialId }}</h3></div><span>v{{ reviewRecord.version }}</span></div><dl class="record-grid"><div><dt>签发组织</dt><dd>{{ reviewRecord.issuerMspId }}</dd></div><div><dt>Schema</dt><dd>{{ reviewRecord.schemaVersion }}</dd></div><div><dt>学生匿名标识</dt><dd class="mono">{{ shortHash(reviewRecord.subjectHash) }}</dd></div><div><dt>课程标识</dt><dd class="mono">{{ shortHash(reviewRecord.courseHash) }}</dd></div><div class="wide"><dt>详情哈希承诺</dt><dd class="mono">{{ reviewRecord.detailHash }}</dd></div><div class="wide"><dt>提交者身份哈希</dt><dd class="mono">{{ reviewRecord.submittedByIdentityHash }}</dd></div></dl><div class="review-actions"><p>批准后写入 reviewer 身份哈希并激活凭证，此操作不可覆盖历史记录。</p><button class="button primary" :disabled="reviewRecord.status !== 'PENDING_REVIEW' || reviewerState === 'loading'" @click="approveCredential">批准并激活</button></div></article>
        <section class="operation-panel appeal-review-panel"><div class="operation-heading"><div><p class="eyebrow">APPEAL REVIEW</p><h3>申诉复核与结论承诺</h3></div><span>理由与结论均不公开</span></div><div class="lookup-row"><input v-model="appealReviewForm.appealId" aria-label="申诉标识" /><button class="button secondary" :disabled="appealReviewState === 'loading'" @click="loadAppealForReview">查询申诉</button></div><p v-if="appealReviewMessage" class="notice" :class="appealReviewState">{{ appealReviewMessage }}</p><article v-if="appealReviewRecord" class="appeal-summary"><div><span class="status" :class="appealReviewRecord.status.toLowerCase()">{{ appealReviewRecord.status }}</span><b>{{ appealReviewRecord.appealId }}</b></div><p>关联凭证：{{ appealReviewRecord.credentialId }}</p><p class="mono">reason {{ shortHash(appealReviewRecord.reasonHash) }}</p><form v-if="appealReviewRecord.status === 'OPEN'" class="compact-form" @submit.prevent="resolveAppeal"><div class="field"><label for="appeal-decision">处理结论</label><select id="appeal-decision" v-model="appealReviewForm.decision"><option value="ACCEPTED">接受申诉</option><option value="REJECTED">驳回申诉</option></select></div><div class="field"><label for="resolution-salt">结论隐私盐值</label><input id="resolution-salt" v-model="appealReviewForm.salt" minlength="16" required /></div><div class="field wide"><label for="resolution-summary">结论说明</label><textarea id="resolution-summary" v-model="appealReviewForm.summary" minlength="10" required></textarea></div><button class="button primary" :disabled="appealReviewState === 'loading'">提交复核结论</button></form></article></section>
      </section>
      <section v-else-if="currentView === 'student'" class="workspace shell">
        <div class="workspace-intro"><span class="role-token">STUDENT</span><h2>查看凭证并提交本人申诉</h2><p>学生端围绕“持有、理解、申诉、授权披露”设计。申诉由带有 subject.hash 属性的学生证书提交，理由只进入签发组织私有集合。</p></div>
        <div class="lookup-panel"><label for="student-id">凭证标识</label><div class="lookup-row"><input id="student-id" v-model="studentCredentialId" /><button class="button secondary" :disabled="studentState === 'loading'" @click="loadStudentCredential">打开凭证</button></div><p v-if="studentMessage" class="notice" :class="studentState">{{ studentMessage }}</p></div>
        <article v-if="studentRecord" class="student-card"><div class="credential-seal">CG</div><div class="student-card-main"><p>ACADEMIC CREDENTIAL · v{{ studentRecord.version }}</p><h3>{{ studentRecord.credentialId }}</h3><span class="status" :class="studentRecord.status.toLowerCase()">{{ studentRecord.status }}</span><dl><div><dt>签发组织</dt><dd>{{ studentRecord.issuerMspId }}</dd></div><div><dt>最近更新</dt><dd>{{ formatTime(studentRecord.updatedAt) }}</dd></div><div><dt>成绩详情</dt><dd>仅授权后披露</dd></div></dl><div class="student-actions"><button class="button secondary" :disabled="studentRecord.status !== 'ACTIVE'" @click="scrollToAppeal">发起成绩申诉</button><button class="button primary" @click="openView('verify')">生成验真入口</button></div></div></article>
        <section id="appeal-form" class="operation-panel"><div class="operation-heading"><div><p class="eyebrow">PRIVATE APPEAL</p><h3>提交轻量成绩申诉</h3></div><span>学生属性证书约束本人凭证</span></div><form class="compact-form" @submit.prevent="submitAppeal"><div class="field"><label for="appeal-id">申诉标识</label><input id="appeal-id" v-model="appealForm.appealId" required /></div><div class="field"><label>关联凭证</label><input :value="studentRecord?.credentialId ?? studentCredentialId" disabled /></div><div class="field wide"><label for="appeal-reason">申诉理由</label><textarea id="appeal-reason" v-model="appealForm.reason" minlength="10" maxlength="2000" required></textarea></div><div class="field wide"><label for="appeal-salt">申诉隐私盐值</label><input id="appeal-salt" v-model="appealForm.salt" class="mono" minlength="16" required /></div><button class="button primary" :disabled="appealState === 'loading' || studentRecord?.status !== 'ACTIVE'">{{ appealState === 'loading' ? '正在提交…' : '由学生证书提交申诉' }}</button><p v-if="appealMessage" class="notice" :class="appealState">{{ appealMessage }}</p></form><article v-if="submittedAppeal" class="mini-result"><span class="status open">{{ submittedAppeal.status }}</span><b>{{ submittedAppeal.appealId }}</b><span class="mono">reason {{ shortHash(submittedAppeal.reasonHash) }}</span></article></section>
      </section>
      <section v-else class="workspace verify-workspace shell">
        <div class="workspace-intro"><span class="role-token public">PUBLIC</span><h2>不接触明文，也能判断真伪</h2><p>输入凭证标识和持有者提供的详情哈希。系统只返回真实性、有效状态、签发组织和链上审计字段。</p></div>
        <form class="verify-panel" @submit.prevent="verifyCredential"><div class="field"><label for="verify-id">凭证标识</label><input id="verify-id" v-model="verifyCredentialId" required /></div><div class="field"><label for="detail-hash">详情哈希（可选）</label><input id="detail-hash" v-model="verifyDetailHash" class="mono" placeholder="64 位 SHA-256" /></div><button class="button primary" :disabled="verifyState === 'loading'">{{ verifyState === 'loading' ? '正在访问账本…' : '开始验真' }}</button><p v-if="verifyMessage" class="notice" :class="verifyState">{{ verifyMessage }}</p></form>
        <article v-if="verification" class="verification-result" :class="{ authentic: verification.authentic && verification.valid, invalid: !verification.authentic || !verification.valid }"><div class="verification-icon">{{ verification.authentic && verification.valid ? '✓' : '!' }}</div><div><p>{{ verification.authentic && verification.valid ? 'VERIFIED ON CHAIN' : 'VERIFICATION WARNING' }}</p><h3>{{ verification.authentic && verification.valid ? '凭证真实且当前有效' : '凭证未通过完整验证' }}</h3><span>{{ verification.authentic ? '哈希匹配' : '哈希不匹配' }} · {{ verification.valid ? '状态有效' : `状态 ${verification.status}` }}</span></div><dl><div><dt>签发组织</dt><dd>{{ verification.issuerMspId }}</dd></div><div><dt>当前版本</dt><dd>v{{ verification.version }}</dd></div><div><dt>审计交易</dt><dd class="mono">{{ shortHash(verification.transactionId) }}</dd></div></dl></article>
      </section>
    </template>
    <footer class="footer shell"><div class="brand"><span class="brand-mark">CG</span><span>ChainGrade</span></div><p>课程答辩与 CCF 竞赛 · 同一个持续演进项目</p><a href="#home">返回总览 ↑</a></footer>
  </main>
</template>
