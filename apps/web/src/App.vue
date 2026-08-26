<script setup lang="ts">
import type { PublicAppealRecord, PublicCredentialRecord } from '@chaingrade/shared';
import QrcodeVue from 'qrcode.vue';
import {
  PhArrowRight, PhBookOpenText, PhCertificate, PhCheckCircle, PhFileText,
  PhGlobe, PhGraduationCap, PhLink, PhList, PhLockKey, PhMagnifyingGlass,
  PhShieldCheck, PhStudent, PhUserCircle, PhUsersThree, PhX,
} from '@phosphor-icons/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

type View = 'home' | 'issuer' | 'reviewer' | 'student' | 'verify';
type RequestState = 'idle' | 'loading' | 'success' | 'error';
type AppRole = 'issuer' | 'reviewer' | 'student';

interface SessionView {
  authenticated: boolean;
  username?: string;
  role?: AppRole;
  subjectHash?: string;
  csrfToken?: string;
  expiresAt?: string;
}

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
const authRequired = ref(true);
const session = ref<SessionView>({ authenticated: false });
const loginState = ref<RequestState>('idle');
const loginMessage = ref('');
const loginForm = ref({ username: '', password: '' });

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
const privateDetailsState = ref<RequestState>('idle');
const privateDetailsMessage = ref('');
const privateDetails = ref<Record<string, unknown>>();
const sharePanelOpen = ref(false);
const shareCopyMessage = ref('');
const appealState = ref<RequestState>('idle');
const appealMessage = ref('');
const submittedAppeal = ref<PublicAppealRecord>();
const appealForm = ref({ appealId: 'appeal:2026:web01', reason: '实验成绩未计入总评，请复核原始评分记录。', salt: 'CHAIN_GRADE_APPEAL_2026' });
const verifyCredentialId = ref('cred:2026:real01');
const verifyDetailHash = ref('ebc3ed396f7fba90bd55c28ed6233ac446b164bd0cade67435494980cb5e128e');
const verifyState = ref<RequestState>('idle');
const verifyMessage = ref('');
const verification = ref<VerificationResult>();

const viewLabel = computed(() => ({ home: '可信成绩工作台', issuer: '教师签发', reviewer: '独立复核', student: '学生凭证', verify: '公开验真' })[currentView.value]);
const viewMeta = computed(() => ({
  issuer: { index: '01', en: 'ISSUE', statement: '一纸成绩，先成为可验证的承诺。', access: '教师授权区', icon: PhGraduationCap },
  reviewer: { index: '02', en: 'REVIEW', statement: '信任不靠默认，而由独立复核建立。', access: '复核员授权区', icon: PhShieldCheck },
  student: { index: '03', en: 'HOLD', statement: '成绩属于学生，证据经得起追溯。', access: '学生本人空间', icon: PhStudent },
  verify: { index: '04', en: 'VERIFY', statement: '不见成绩明文，也能确认一份真实。', access: '公共访问区', icon: PhMagnifyingGlass },
} as const)[currentView.value as Exclude<View, 'home'>]);
const requiredRole = computed<AppRole | undefined>(() => ({ issuer: 'issuer', reviewer: 'reviewer', student: 'student' } as Partial<Record<View, AppRole>>)[currentView.value]);
const sessionMatchesView = computed(() => !authRequired.value || !requiredRole.value || (session.value.authenticated && session.value.role === requiredRole.value));
const verificationShareUrl = computed(() => {
  if (!studentRecord.value) return '';
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = 'verify';
  url.searchParams.set('credentialId', studentRecord.value.credentialId);
  url.searchParams.set('detailHash', studentRecord.value.detailHash);
  return url.toString();
});

function viewFromHash(): View {
  const candidate = window.location.hash.replace(/^#\/?/, '') as View;
  return views.includes(candidate) ? candidate : 'home';
}
function syncHash(): void { currentView.value = viewFromHash(); mobileMenuOpen.value = false; window.scrollTo({ top: 0, behavior: 'smooth' }); }
function openView(view: View): void { window.location.hash = `#${view}`; }
function scrollToAppeal(): void { document.getElementById('appeal-form')?.scrollIntoView({ behavior: 'smooth' }); }
function openSharePanel(): void { sharePanelOpen.value = true; shareCopyMessage.value = ''; }
async function copyShareLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(verificationShareUrl.value);
    shareCopyMessage.value = '链接已复制';
  } catch {
    shareCopyMessage.value = '请手动复制';
  }
}
function openSharedVerification(): void {
  if (studentRecord.value) {
    verifyCredentialId.value = studentRecord.value.credentialId;
    verifyDetailHash.value = studentRecord.value.detailHash;
  }
  openView('verify');
}
function hydrateVerificationFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const credentialId = params.get('credentialId');
  const detailHash = params.get('detailHash');
  if (credentialId) verifyCredentialId.value = credentialId;
  if (detailHash) verifyDetailHash.value = detailHash;
}
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && session.value.csrfToken) headers.set('x-csrf-token', session.value.csrfToken);
  const response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : `请求失败（${response.status}）`);
  return payload as T;
}

async function loadSession(): Promise<void> {
  try {
    const response = await fetch('/api/v1/auth/session', { credentials: 'same-origin' });
    if (response.status === 404) { authRequired.value = false; return; }
    authRequired.value = true;
    session.value = await response.json() as SessionView;
  } catch { session.value = { authenticated: false }; }
}
async function login(): Promise<void> {
  loginState.value = 'loading'; loginMessage.value = '';
  try { session.value = await requestJson<SessionView>('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(loginForm.value) }); loginForm.value.password = ''; loginState.value = 'success'; loginMessage.value = `已以 ${session.value.role} 身份建立短期会话。`; }
  catch (error) { loginState.value = 'error'; loginMessage.value = error instanceof Error ? error.message : '登录失败'; }
}
async function logout(): Promise<void> {
  try { await requestJson<SessionView>('/api/v1/auth/logout', { method: 'POST' }); }
  finally { session.value = { authenticated: false }; loginForm.value.username = ''; }
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
  studentState.value = 'loading'; studentMessage.value = ''; privateDetails.value = undefined; privateDetailsMessage.value = ''; privateDetailsState.value = 'idle';
  try { studentRecord.value = await requestJson<PublicCredentialRecord>(`/api/v1/credentials/${encodeURIComponent(studentCredentialId.value)}`); studentState.value = 'success'; }
  catch (error) { studentState.value = 'error'; studentMessage.value = error instanceof Error ? error.message : '查询失败'; }
}
async function loadPrivateDetails(): Promise<void> {
  const credentialId = studentRecord.value?.credentialId ?? studentCredentialId.value;
  privateDetailsState.value = 'loading'; privateDetailsMessage.value = '';
  try { privateDetails.value = await requestJson<Record<string, unknown>>(`/api/v1/credentials/${encodeURIComponent(credentialId)}/private-details`); privateDetailsState.value = 'success'; privateDetailsMessage.value = '链码已验证学生证书 subject.hash，私有成绩仅在本次授权响应中返回。'; }
  catch (error) { privateDetailsState.value = 'error'; privateDetailsMessage.value = error instanceof Error ? error.message : '私有成绩读取失败'; }
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
onMounted(() => { hydrateVerificationFromUrl(); currentView.value = viewFromHash(); void loadSession(); window.addEventListener('hashchange', syncHash); });
onBeforeUnmount(() => window.removeEventListener('hashchange', syncHash));
</script>

<template>
  <main>
    <nav class="nav" aria-label="主导航">
      <a class="brand" href="#home" aria-label="ChainGrade 首页"><span class="brand-mark" aria-hidden="true"><PhShieldCheck :size="20" weight="fill" /></span><span>ChainGrade</span></a>
      <div class="network-state"><span></span>真实 Fabric 账本已连接</div>
      <div class="desktop-nav"><a href="#issuer">教师签发</a><a href="#reviewer">独立复核</a><a href="#student">学生凭证</a><a class="nav-verify" href="#verify"><PhMagnifyingGlass :size="17" />公开验真</a></div>
      <div v-if="authRequired && session.authenticated" class="session-nav"><PhUserCircle :size="18" /><span>{{ session.role }}</span><b>{{ session.username }}</b><button type="button" @click="logout">退出</button></div>
      <button class="menu-button" type="button" :aria-label="mobileMenuOpen ? '关闭导航' : '打开导航'" @click="mobileMenuOpen = !mobileMenuOpen"><PhX v-if="mobileMenuOpen" :size="21" /><PhList v-else :size="22" /></button>
      <div v-if="mobileMenuOpen" class="mobile-nav"><a href="#issuer">教师签发</a><a href="#reviewer">独立复核</a><a href="#student">学生凭证</a><a href="#verify">公开验真</a></div>
    </nav>

    <template v-if="currentView === 'home'">
      <div class="dashboard-shell">
        <aside class="side-nav" aria-label="工作台导航">
          <div class="side-group"><p>工作台</p><a class="active" href="#home"><PhFileText :size="20" />可信成绩工作台</a></div>
          <div class="side-group"><p>工作流程</p><a href="#issuer"><PhGraduationCap :size="20" />教师签发</a><a href="#reviewer"><PhShieldCheck :size="20" />独立复核</a><a href="#student"><PhStudent :size="20" />学生凭证</a><a href="#verify"><PhMagnifyingGlass :size="20" />公开验真</a></div>
          <div class="side-group"><p>信任与规则</p><a href="#home"><PhBookOpenText :size="20" />机制说明</a><a href="#home"><PhUsersThree :size="20" />节点与机构</a><a href="#home"><PhLockKey :size="20" />隐私与公开</a></div>
          <dl class="ledger-status"><div><dt>账本状态</dt><dd><span></span>正常</dd></div><div><dt>网络</dt><dd>Fabric 2.5 LTS</dd></div><div><dt>通道</dt><dd class="mono">chaingrade</dd></div><div><dt>链码</dt><dd class="mono">grade 0.4</dd></div><div><dt>区块高度</dt><dd>23</dd></div><div><dt>节点</dt><dd>Org1 / Org2</dd></div></dl>
        </aside>

        <section class="dashboard-main">
          <header class="dashboard-heading"><div><h1>可信成绩工作台</h1><p>凭证签发、复核与验证记录</p></div><div class="dashboard-actions"><button class="button primary" type="button" @click="openView('verify')"><PhMagnifyingGlass :size="18" />公开验真</button><button class="button secondary" type="button" @click="openView('student')"><PhLink :size="18" />查看链上证据</button></div></header>

          <dl class="trust-summary">
            <div><PhCheckCircle :size="28" weight="duotone" /><span><dt>凭证状态</dt><dd>已通过独立复核</dd><small>当前状态：ACTIVE</small></span></div>
            <div><PhGlobe :size="28" weight="duotone" /><span><dt>公开状态</dt><dd>私有成绩</dd><small>隐式私有集合</small></span></div>
            <div><PhFileText :size="28" weight="duotone" /><span><dt>教师签发</dt><dd>签发完成</dd><small>1 项凭证</small></span></div>
            <div><PhShieldCheck :size="28" weight="duotone" /><span><dt>独立复核</dt><dd>复核完成</dd><small>1 项复核</small></span></div>
            <div><PhUserCircle :size="28" weight="duotone" /><span><dt>学生凭证</dt><dd>学生持有</dd><small>本人属性约束</small></span></div>
          </dl>

          <section class="evidence-ledger" aria-labelledby="evidence-heading">
            <div class="table-heading"><div><h2 id="evidence-heading">证据链状态</h2><p>公共状态可审计，成绩详情保留在授权范围内。</p></div><span>当前记录</span></div>
            <div class="evidence-table" role="table" aria-label="链上证据状态">
              <div class="evidence-row header" role="row"><span>记录</span><span>阶段</span><span>状态</span><span>隐私范围</span><span>链上证据</span></div>
              <button class="evidence-row" type="button" role="row" @click="openView('student')"><span class="mono">cred:2026:web01-v2</span><span><PhCertificate :size="19" />凭证修订</span><span><b class="status active">ACTIVE</b><small>版本 v2</small></span><span>隐式私有集合</span><span class="mono">height 23 <PhArrowRight :size="16" /></span></button>
              <button class="evidence-row" type="button" role="row" @click="openView('student')"><span class="mono">cred:2026:web01</span><span><PhFileText :size="19" />历史版本</span><span><b class="status superseded">SUPERSEDED</b><small>由 v2 替代</small></span><span>公共状态</span><span class="mono">可追溯 <PhArrowRight :size="16" /></span></button>
              <button class="evidence-row" type="button" role="row" @click="openView('reviewer')"><span class="mono">appeal:2026:web01</span><span><PhShieldCheck :size="19" />申诉复核</span><span><b class="status resolved_accepted">ACCEPTED</b><small>复核已完成</small></span><span>理由与结论私有</span><span class="mono">哈希承诺 <PhArrowRight :size="16" /></span></button>
              <button class="evidence-row" type="button" role="row" @click="openView('verify')"><span class="mono">cred:2026:real01</span><span><PhGlobe :size="19" />公开验真</span><span><b class="status active">VERIFIED</b><small>哈希一致</small></span><span>公开哈希</span><span class="mono">52ddff39… <PhArrowRight :size="16" /></span></button>
            </div>
          </section>

          <aside class="privacy-note"><PhLockKey :size="20" weight="fill" /><p><b>隐私说明</b> 成绩详情与申诉材料存储于隐式私有集合，仅授权方可见；公共账本只保留哈希、状态与审计元数据。</p><button type="button" @click="openView('verify')">了解公开验真规则<PhArrowRight :size="16" /></button></aside>
        </section>
      </div>
    </template>

    <template v-else>
      <div class="workspace-stage">
        <header class="workspace-header shell">
          <div class="display-lockup">
            <span class="display-index">{{ viewMeta.index }}</span>
            <div><p class="eyebrow">{{ viewMeta.en }} / CHAIN GRADE</p><h1>{{ viewLabel }}</h1><p class="art-line">{{ viewMeta.statement }}</p></div>
          </div>
          <div class="stage-meta"><component :is="viewMeta.icon" :size="24" weight="duotone" /><span>{{ viewMeta.access }}</span><b>Fabric 2.5 LTS</b></div>
        </header>
        <nav class="workspace-tabs shell" aria-label="业务流程导航">
          <a href="#issuer" :class="{ active: currentView === 'issuer' }"><span>01</span>教师签发</a>
          <a href="#reviewer" :class="{ active: currentView === 'reviewer' }"><span>02</span>独立复核</a>
          <a href="#student" :class="{ active: currentView === 'student' }"><span>03</span>学生凭证</a>
          <a href="#verify" :class="{ active: currentView === 'verify' }"><span>04</span>公开验真</a>
        </nav>
      </div>
      <section v-if="!sessionMatchesView" class="auth-gate shell"><div><span class="role-token">SECURE SESSION</span><h2>{{ session.authenticated ? '当前角色与工作台不匹配' : '登录后进入角色工作台' }}</h2><p>Cookie 仅供浏览器自动携带，JavaScript 无法读取；状态变更还必须通过同源与 CSRF 令牌校验。</p><p v-if="session.authenticated" class="notice error">当前会话为 {{ session.role }}，本页面要求 {{ requiredRole }}。登录新账号将安全替换当前会话。</p></div><form class="auth-form" @submit.prevent="login"><div class="field"><label for="login-username">账号</label><input id="login-username" v-model="loginForm.username" autocomplete="username" placeholder="输入账号" required /></div><div class="field"><label for="login-password">密码</label><input id="login-password" v-model="loginForm.password" type="password" autocomplete="current-password" placeholder="输入密码" required /></div><button class="button primary" :disabled="loginState === 'loading'">{{ loginState === 'loading' ? '正在建立会话…' : '安全登录' }}</button><p v-if="loginMessage" class="notice" :class="loginState">{{ loginMessage }}</p><small>凭据由服务端安全配置，会话默认 1 小时后失效。</small></form></section>
      <section v-else-if="currentView === 'issuer'" class="workspace shell">
        <div class="workspace-intro"><span class="role-token">ISSUER</span><h2>创建待复核成绩草稿</h2><p>成绩详情会先规范化并计算 SHA-256，再通过 transient data 进入签发组织的隐式私有集合。</p></div>
        <div class="workspace-content">
        <form class="form-panel" @submit.prevent="submitCredential"><div class="field wide"><label for="credential-id">凭证标识</label><input id="credential-id" v-model="issuerForm.credentialId" required /></div><div class="field"><label for="course-name">课程名称</label><input id="course-name" v-model="issuerForm.courseName" required /></div><div class="field"><label for="score">成绩</label><input id="score" v-model.number="issuerForm.score" type="number" min="0" max="100" required /></div><div class="field"><label for="grade">等级</label><select id="grade" v-model="issuerForm.grade"><option>A</option><option>B</option><option>C</option><option>D</option><option>F</option></select></div><div class="field"><label for="schema-version">Schema 版本</label><input id="schema-version" v-model="issuerForm.schemaVersion" required /></div><div class="field wide"><label for="subject-hash">学生匿名标识（SHA-256）</label><input id="subject-hash" v-model="issuerForm.subjectHash" class="mono" minlength="64" maxlength="64" required /></div><div class="field wide"><label for="course-hash">课程标识（SHA-256）</label><input id="course-hash" v-model="issuerForm.courseHash" class="mono" minlength="64" maxlength="64" required /></div><div class="field wide"><label for="salt">隐私盐值</label><input id="salt" v-model="issuerForm.salt" class="mono" minlength="16" required /><small>生产环境必须使用安全随机值，且不得与成绩明文一同公开。</small></div><div class="form-actions"><button class="button primary" :disabled="issuerState === 'loading'">{{ issuerState === 'loading' ? '正在提交…' : '提交至 Fabric' }}</button><span>复核前状态为 PENDING_REVIEW</span></div><p v-if="issuerMessage" class="notice" :class="issuerState">{{ issuerMessage }}</p></form>
        <article v-if="issuedRecord" class="result-card"><div><span class="status pending">{{ issuedRecord.status }}</span><h3>{{ issuedRecord.credentialId }}</h3></div><dl><div><dt>详情承诺</dt><dd class="mono">{{ shortHash(issuedRecord.detailHash) }}</dd></div><div><dt>交易 ID</dt><dd class="mono">{{ shortHash(issuedRecord.transactionId) }}</dd></div></dl><button class="text-button" @click="openView('reviewer')">交给复核员 →</button></article>
        <section class="operation-panel"><div class="operation-heading"><div><p class="eyebrow">IMMUTABLE AMENDMENT</p><h3>创建不可覆盖的修订版本</h3></div><span>旧版本保持可审计</span></div><form class="compact-form" @submit.prevent="submitAmendment"><div class="field"><label for="previous-id">原凭证标识</label><input id="previous-id" v-model="amendmentForm.previousCredentialId" required /></div><div class="field"><label for="amended-id">新版本标识</label><input id="amended-id" v-model="amendmentForm.credentialId" required /></div><div class="field"><label for="amended-score">修订成绩</label><input id="amended-score" v-model.number="amendmentForm.score" type="number" min="0" max="100" required /></div><div class="field"><label for="amended-grade">修订等级</label><select id="amended-grade" v-model="amendmentForm.grade"><option>A</option><option>B</option><option>C</option><option>D</option><option>F</option></select></div><div class="field wide"><label for="amended-course">课程名称</label><input id="amended-course" v-model="amendmentForm.courseName" required /></div><div class="field wide"><label for="amended-salt">新版本隐私盐值</label><input id="amended-salt" v-model="amendmentForm.salt" class="mono" minlength="16" required /></div><button class="button primary" :disabled="amendmentState === 'loading'">{{ amendmentState === 'loading' ? '正在创建…' : '创建修订草稿' }}</button><p v-if="amendmentMessage" class="notice" :class="amendmentState">{{ amendmentMessage }}</p></form><article v-if="amendedRecord" class="mini-result"><span class="status pending_review">{{ amendedRecord.status }}</span><b>{{ amendedRecord.credentialId }}</b><span>v{{ amendedRecord.version }} · previous {{ amendedRecord.previousCredentialId }}</span><button class="text-button" @click="openView('reviewer')">转交复核 →</button></article></section>
        </div>
      </section>
      <section v-else-if="currentView === 'reviewer'" class="workspace shell">
        <div class="workspace-intro"><span class="role-token">REVIEWER</span><h2>独立复核公开承诺</h2><p>复核身份与提交身份使用不同证书。当前工作台只展示公共账本字段，不读取成绩明文。</p></div>
        <div class="workspace-content">
        <div class="lookup-panel"><label for="review-id">凭证标识</label><div class="lookup-row"><input id="review-id" v-model="reviewerCredentialId" /><button class="button secondary" :disabled="reviewerState === 'loading'" @click="loadForReview">查询账本</button></div><p v-if="reviewerMessage" class="notice" :class="reviewerState">{{ reviewerMessage }}</p></div>
        <article v-if="!reviewRecord" class="empty-guidance"><PhShieldCheck :size="34" weight="duotone" /><div><span>WAITING FOR EVIDENCE</span><h3>从公开账本载入待复核承诺</h3><p>复核员将看到签发组织、匿名主体、课程标识与详情哈希；成绩明文不会出现在此处。</p></div><ol><li>输入凭证标识</li><li>核对公共承诺</li><li>批准并激活</li></ol></article>
        <article v-if="reviewRecord" class="review-sheet"><div class="sheet-head"><div><span class="status" :class="reviewRecord.status.toLowerCase()">{{ reviewRecord.status }}</span><h3>{{ reviewRecord.credentialId }}</h3></div><span>v{{ reviewRecord.version }}</span></div><dl class="record-grid"><div><dt>签发组织</dt><dd>{{ reviewRecord.issuerMspId }}</dd></div><div><dt>Schema</dt><dd>{{ reviewRecord.schemaVersion }}</dd></div><div><dt>学生匿名标识</dt><dd class="mono">{{ shortHash(reviewRecord.subjectHash) }}</dd></div><div><dt>课程标识</dt><dd class="mono">{{ shortHash(reviewRecord.courseHash) }}</dd></div><div class="wide"><dt>详情哈希承诺</dt><dd class="mono">{{ reviewRecord.detailHash }}</dd></div><div class="wide"><dt>提交者身份哈希</dt><dd class="mono">{{ reviewRecord.submittedByIdentityHash }}</dd></div></dl><div class="review-actions"><p>批准后写入 reviewer 身份哈希并激活凭证，此操作不可覆盖历史记录。</p><button class="button primary" :disabled="reviewRecord.status !== 'PENDING_REVIEW' || reviewerState === 'loading'" @click="approveCredential">批准并激活</button></div></article>
        <section class="operation-panel appeal-review-panel"><div class="operation-heading"><div><p class="eyebrow">APPEAL REVIEW</p><h3>申诉复核与结论承诺</h3></div><span>理由与结论均不公开</span></div><div class="lookup-row"><input v-model="appealReviewForm.appealId" aria-label="申诉标识" /><button class="button secondary" :disabled="appealReviewState === 'loading'" @click="loadAppealForReview">查询申诉</button></div><p v-if="appealReviewMessage" class="notice" :class="appealReviewState">{{ appealReviewMessage }}</p><article v-if="appealReviewRecord" class="appeal-summary"><div><span class="status" :class="appealReviewRecord.status.toLowerCase()">{{ appealReviewRecord.status }}</span><b>{{ appealReviewRecord.appealId }}</b></div><p>关联凭证：{{ appealReviewRecord.credentialId }}</p><p class="mono">reason {{ shortHash(appealReviewRecord.reasonHash) }}</p><form v-if="appealReviewRecord.status === 'OPEN'" class="compact-form" @submit.prevent="resolveAppeal"><div class="field"><label for="appeal-decision">处理结论</label><select id="appeal-decision" v-model="appealReviewForm.decision"><option value="ACCEPTED">接受申诉</option><option value="REJECTED">驳回申诉</option></select></div><div class="field"><label for="resolution-salt">结论隐私盐值</label><input id="resolution-salt" v-model="appealReviewForm.salt" minlength="16" required /></div><div class="field wide"><label for="resolution-summary">结论说明</label><textarea id="resolution-summary" v-model="appealReviewForm.summary" minlength="10" required></textarea></div><button class="button primary" :disabled="appealReviewState === 'loading'">提交复核结论</button></form></article></section>
        </div>
      </section>
      <section v-else-if="currentView === 'student'" class="workspace shell">
        <div class="workspace-intro"><span class="role-token">STUDENT</span><h2>查看凭证并提交本人申诉</h2><p>学生端围绕“持有、理解、申诉、授权披露”设计。申诉由带有 subject.hash 属性的学生证书提交，理由只进入签发组织私有集合。</p></div>
        <div class="workspace-content">
        <div class="lookup-panel"><label for="student-id">凭证标识</label><div class="lookup-row"><input id="student-id" v-model="studentCredentialId" /><button class="button secondary" :disabled="studentState === 'loading'" @click="loadStudentCredential">打开凭证</button></div><p v-if="studentMessage" class="notice" :class="studentState">{{ studentMessage }}</p></div>
        <article v-if="!studentRecord" class="empty-guidance student-guidance"><PhStudent :size="34" weight="duotone" /><div><span>YOUR CREDENTIAL SPACE</span><h3>凭证在这里成为学生可理解的证据</h3><p>打开凭证后可查看有效状态、请求本人私有成绩，或针对当前有效版本发起轻量申诉。</p></div><ol><li>打开本人凭证</li><li>按需披露成绩</li><li>提交私有申诉</li></ol></article>
        <article v-if="studentRecord" class="student-card"><div class="credential-seal">CG</div><div class="student-card-main"><p>ACADEMIC CREDENTIAL · v{{ studentRecord.version }}</p><h3>{{ studentRecord.credentialId }}</h3><span class="status" :class="studentRecord.status.toLowerCase()">{{ studentRecord.status }}</span><dl><div><dt>签发组织</dt><dd>{{ studentRecord.issuerMspId }}</dd></div><div><dt>最近更新</dt><dd>{{ formatTime(studentRecord.updatedAt) }}</dd></div><div><dt>成绩详情</dt><dd>{{ privateDetails ? '本人授权已读取' : '仅授权后披露' }}</dd></div></dl><div class="student-actions"><button class="button secondary" :disabled="studentRecord.status !== 'ACTIVE'" @click="scrollToAppeal">发起成绩申诉</button><button class="button secondary" :disabled="privateDetailsState === 'loading'" @click="loadPrivateDetails">{{ privateDetailsState === 'loading' ? '正在验证证书…' : '授权读取成绩' }}</button><button class="button primary" @click="openSharePanel">生成验真入口</button></div></div></article>
        <article v-if="sharePanelOpen && studentRecord" class="share-card"><div class="qr-frame"><QrcodeVue :value="verificationShareUrl" :size="184" level="M" render-as="svg" /></div><div class="share-copy"><p class="eyebrow">SHAREABLE VERIFICATION</p><h3>让核验者扫码查看链上结论</h3><p>二维码只携带凭证标识与详情哈希，不包含成绩、盐值或学生身份信息。持有者可自主决定是否分享。</p><div class="share-url mono">{{ verificationShareUrl }}</div><div class="share-actions"><button class="button secondary" type="button" @click="copyShareLink">{{ shareCopyMessage || '复制验真链接' }}</button><button class="button primary" type="button" @click="openSharedVerification">预览验真结果</button></div></div></article>
        <article v-if="privateDetails || privateDetailsMessage" class="private-details-card"><div class="operation-heading"><div><p class="eyebrow">SUBJECT-BOUND DISCLOSURE</p><h3>仅向本人披露的成绩详情</h3></div><span>Cache-Control: no-store</span></div><p v-if="privateDetailsMessage" class="notice" :class="privateDetailsState">{{ privateDetailsMessage }}</p><dl v-if="privateDetails"><div v-for="(value, key) in privateDetails" :key="key"><dt>{{ key }}</dt><dd :class="{ mono: key === 'salt' }">{{ key === 'salt' ? '••••••••（不展示）' : value }}</dd></div></dl></article>
        <section id="appeal-form" class="operation-panel"><div class="operation-heading"><div><p class="eyebrow">PRIVATE APPEAL</p><h3>提交轻量成绩申诉</h3></div><span>学生属性证书约束本人凭证</span></div><form class="compact-form" @submit.prevent="submitAppeal"><div class="field"><label for="appeal-id">申诉标识</label><input id="appeal-id" v-model="appealForm.appealId" required /></div><div class="field"><label>关联凭证</label><input :value="studentRecord?.credentialId ?? studentCredentialId" disabled /></div><div class="field wide"><label for="appeal-reason">申诉理由</label><textarea id="appeal-reason" v-model="appealForm.reason" minlength="10" maxlength="2000" required></textarea></div><div class="field wide"><label for="appeal-salt">申诉隐私盐值</label><input id="appeal-salt" v-model="appealForm.salt" class="mono" minlength="16" required /></div><button class="button primary" :disabled="appealState === 'loading' || studentRecord?.status !== 'ACTIVE'">{{ appealState === 'loading' ? '正在提交…' : '由学生证书提交申诉' }}</button><p v-if="appealMessage" class="notice" :class="appealState">{{ appealMessage }}</p></form><article v-if="submittedAppeal" class="mini-result"><span class="status open">{{ submittedAppeal.status }}</span><b>{{ submittedAppeal.appealId }}</b><span class="mono">reason {{ shortHash(submittedAppeal.reasonHash) }}</span></article></section>
        </div>
      </section>
      <section v-else class="workspace verify-workspace shell">
        <div class="workspace-intro"><span class="role-token public">PUBLIC</span><h2>不接触明文，也能判断真伪</h2><p>输入凭证标识和持有者提供的详情哈希。系统只返回真实性、有效状态、签发组织和链上审计字段。</p></div>
        <div class="workspace-content">
        <form class="verify-panel" @submit.prevent="verifyCredential"><div class="field"><label for="verify-id">凭证标识</label><input id="verify-id" v-model="verifyCredentialId" required /></div><div class="field"><label for="detail-hash">详情哈希（可选）</label><input id="detail-hash" v-model="verifyDetailHash" class="mono" placeholder="64 位 SHA-256" /></div><button class="button primary" :disabled="verifyState === 'loading'">{{ verifyState === 'loading' ? '正在访问账本…' : '开始验真' }}</button><p v-if="verifyMessage" class="notice" :class="verifyState">{{ verifyMessage }}</p></form>
        <article v-if="!verification" class="empty-guidance verify-guidance"><PhMagnifyingGlass :size="34" weight="duotone" /><div><span>PUBLIC VERIFICATION</span><h3>验证只回答“真不真”与“是否有效”</h3><p>详情哈希用于比对持有者主动提供的信息；留空时仍可查询凭证的公开状态与签发来源。</p></div><ol><li>提供凭证标识</li><li>可选比对哈希</li><li>读取链上结论</li></ol></article>
        <article v-if="verification" class="verification-result" :class="{ authentic: verification.authentic && verification.valid, invalid: !verification.authentic || !verification.valid }"><div class="verification-icon">{{ verification.authentic && verification.valid ? '✓' : '!' }}</div><div><p>{{ verification.authentic && verification.valid ? 'VERIFIED ON CHAIN' : 'VERIFICATION WARNING' }}</p><h3>{{ verification.authentic && verification.valid ? '凭证真实且当前有效' : '凭证未通过完整验证' }}</h3><span>{{ verification.authentic ? '哈希匹配' : '哈希不匹配' }} · {{ verification.valid ? '状态有效' : `状态 ${verification.status}` }}</span></div><dl><div><dt>签发组织</dt><dd>{{ verification.issuerMspId }}</dd></div><div><dt>当前版本</dt><dd>v{{ verification.version }}</dd></div><div><dt>审计交易</dt><dd class="mono">{{ shortHash(verification.transactionId) }}</dd></div></dl></article>
        </div>
      </section>
      <aside class="principle-strip"><div class="shell"><PhLockKey :size="20" weight="duotone" /><p><b>最小披露原则</b><span>公共账本只承载验证所需的状态、承诺与审计字段，成绩与申诉正文始终留在授权边界内。</span></p><a href="#home">查看证据链全貌<PhArrowRight :size="16" /></a></div></aside>
    </template>
    <footer class="footer"><div class="brand"><span class="brand-mark"><PhShieldCheck :size="17" weight="fill" /></span><span>ChainGrade</span></div><p>Fabric 2.5 LTS <span>·</span> chaingrade <span>·</span> grade 0.4 <span>·</span> 区块高度 23</p><a href="#home">返回工作台</a></footer>
  </main>
</template>
