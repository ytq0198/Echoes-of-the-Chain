<script setup lang="ts">
const capabilities = [
  { number: '01', title: '可信签发', text: '教师提交、院系独立复核，关键状态由 Fabric 交易固化。' },
  { number: '02', title: '最小披露', text: '成绩明文不上公共账本，学生决定披露字段、用途和期限。' },
  { number: '03', title: '持续有效', text: '修订、取代与撤销都有明确版本链，验证者看到当前状态。' },
];

const flow = ['成绩草稿', '独立复核', '学生持有', '授权披露', '即时核验'];
</script>

<template>
  <main>
    <nav class="nav shell" aria-label="主导航">
      <a class="brand" href="#top" aria-label="ChainGrade 首页">
        <span class="brand-mark" aria-hidden="true">CG</span>
        <span>ChainGrade</span>
      </a>
      <span class="phase-badge">Iteration 0 · 工程验证中</span>
    </nav>

    <section id="top" class="hero shell">
      <div class="hero-copy">
        <p class="eyebrow">ECHOES OF THE CHAIN</p>
        <h1>成绩可信，<br /><span>披露有界。</span></h1>
        <p class="lead">
          面向高校、学生与验证机构的可信学业凭证基础设施。让每次签发可追溯，每次更正留痕，
          每次验证都由学生授权。
        </p>
        <div class="hero-actions">
          <button class="button primary" type="button">查看凭证流程</button>
          <button class="button secondary" type="button">公开核验</button>
        </div>
      </div>

      <aside class="proof-card" aria-label="凭证状态示例">
        <div class="proof-topline">
          <span>ACADEMIC CREDENTIAL</span>
          <span class="active-dot">有效</span>
        </div>
        <div class="proof-seal">✓</div>
        <p class="proof-label">区块链技术与应用</p>
        <p class="proof-title">已通过可信机构复核</p>
        <dl>
          <div>
            <dt>披露范围</dt>
            <dd>课程及通过状态</dd>
          </div>
          <div>
            <dt>精确成绩</dt>
            <dd>未披露</dd>
          </div>
          <div>
            <dt>凭证版本</dt>
            <dd>v1 · ACTIVE</dd>
          </div>
        </dl>
        <div class="hash-line">0x7b2e ··· 91af</div>
      </aside>
    </section>

    <section class="capabilities shell" aria-labelledby="capability-heading">
      <div class="section-heading">
        <p class="eyebrow">WHY BLOCKCHAIN</p>
        <h2 id="capability-heading">不只是把成绩哈希上链</h2>
      </div>
      <div class="capability-grid">
        <article v-for="item in capabilities" :key="item.number" class="capability-card">
          <span>{{ item.number }}</span>
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </article>
      </div>
    </section>

    <section class="flow-section">
      <div class="shell flow-content">
        <div>
          <p class="eyebrow light">ONE PRODUCT · ONE TRUSTED FLOW</p>
          <h2>从成绩形成到外部核验，<br />一条连续证据链。</h2>
        </div>
        <ol class="flow-list">
          <li v-for="(step, index) in flow" :key="step">
            <span>{{ String(index + 1).padStart(2, '0') }}</span
            >{{ step }}
          </li>
        </ol>
      </div>
    </section>
  </main>
</template>
