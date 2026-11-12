// Agent Plans: план агента в правой панели Herdr.
// Роли по props(): { button: true } — кнопка «Plan» рядом с вкладками; иначе — сама панель.
// Данные пишет hook/plan.py в <app home>/data/agent-plans/<терминал>.json.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, terminals, agents, focused, layout, run, theme, shared, setShared, appHome, readTextFile, watchFolder, props, exec, window } from "herdr";
import * as fs from "fs/promises";

const PANEL = "plans";            // id вкладки в стеке panel-body
const STALE_MS = 30 * 60 * 1000;  // план закрытого терминала показываем ещё полчаса
const ICON = "mods/agent-plans/plan.svg";
const SPINNER = "mods/workspace-chrome/spinner.svg";
const REPO = "https://github.com/dendenlarin/herdr-agent-plans";

// Ссылка в браузере системы: у Herdr нет своей команды для этого.
function openLink(url) {
  const os = window()?.platform;
  const [cmd, args] = os === "windows" ? ["cmd", ["/c", "start", "", url]] : [os === "linux" ? "xdg-open" : "open", [url]];
  exec(cmd, args).catch(() => {});
}

const AGENTS = [["claude", "Claude Code"], ["codex", "Codex"]];
const hookScript = () => `${appHome().replace(/\/+$/, "")}/mods/agent-plans/hook/plan.py`;
const dataDir = () => `${appHome().replace(/\/+$/, "")}/data/agent-plans`;
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function programIcon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

const appName = (app) => (app === "codex" ? "Codex" : app === "claude-code" ? "Claude" : "Agent");

export default class AgentPlans extends View {
  init(_props, cx) {
    if (props()?.button) {
      this.button = true;
      // Встроенная полоса вкладок помнит открытую панель для каждого space только для id из этого списка.
      const panels = shared("workspace.panels") ?? ["files", "changes"];
      if (!panels.includes(PANEL)) setShared("workspace.panels", [...panels, PANEL]);
      return;
    }
    this.plans = []; this.sig = ""; this.watching = false;
    this.pick = {};   // выбранный агент по space
    this.open = {};   // раскрытый этап по ключу плана (null — всё свёрнуто)
    this.hooks = null;          // ответ plan.py status: { claude: {present, connected}, codex: {...} }
    this.hookError = false;     // python3 не запустился
    this.showConnect = false;   // строку подключения открыли шестерёнкой
    this.refresh(cx);
    this.checkHooks(cx);
    // Резерв к watchFolder; файлов единицы, чтение дешёвое. Перерисовка — только при изменениях.
    cx.timer.every(3000, (cx) => this.refresh(cx));
    // Раз в минуту: «N min ago» и проверка хуков (там же cx.notify()).
    cx.timer.every(60000, (cx) => this.checkHooks(cx));
  }

  // ---------- данные ----------

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const dir = dataDir();
        let names = [];
        try { names = (await fs.readdir(dir)).filter((n) => n.endsWith(".json") && !n.startsWith(".")); } catch {}
        const plans = [];
        for (const name of names) {
          try {
            const p = JSON.parse(await readTextFile(`${dir}/${name}`));
            if (Array.isArray(p.steps) && p.steps.length) plans.push({ ...p, key: name.slice(0, -5) });
          } catch {}
        }
        const sig = JSON.stringify(plans);
        if (sig !== this.sig) { this.sig = sig; this.plans = plans; cx.notify(); }
        if (!this.watching) this.watch(dir, cx);
      } finally { this.loading = false; }
    });
  }

  watch(dir, cx) {
    this.watching = true;
    cx.spawn(async (cx) => {
      try {
        await fs.mkdir(dir, { recursive: true });
        for (;;) { await watchFolder(dir); this.refresh(cx); }
      } catch { this.watching = false; }
    });
  }

  // Подключены ли хуки — спрашиваем сам скрипт; он же подключает и отключает.
  checkHooks(cx, args = ["status"]) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", [hookScript(), ...args]);
        this.hooks = JSON.parse(r.stdout);
        this.hookError = false;
        this.configError = this.hooks.error ?? null;
      } catch { this.hookError = true; }
      this.busy = null;
      cx.notify();
    });
  }

  // «Connect: [Claude Code] [Codex]» — клик подключает или отключает хуки агента.
  connectRow(t) {
    const present = AGENTS.filter(([id]) => this.hooks?.[id]?.present);
    const line = (text) => div().text_size(12).text_color(t.dim).whitespace_normal().line_height(1.4).child(text);
    if (this.hookError) return v_flex().px(18).py(10).child(line("Agent Plans needs python3 on PATH to connect agents."));
    const err = this.configError ? line(`Couldn't change ${this.configError}`) : null;
    if (!present.length) return null;
    const missing = present.some(([id]) => !this.hooks[id].connected);
    if (!missing && !this.showConnect) return null;
    return v_flex().flex_none().gap(8).px(18).py(12).border_t(1).border_color(t.border)
      .child(h_flex().gap(6).items_center().flex_wrap()
        .child(div().text_size(12).text_color(t.muted).mr(2).child("Connect:"))
        .children(present.map(([id, label]) => {
          const on = this.hooks[id].connected;
          return h_flex().id(`ap-connect-${id}`).h(26).px(10).gap(5).items_center().rounded(13).cursor_pointer()
            .text_size(12).bg(on ? t.done + "24" : t.surface).text_color(on ? t.done : t.muted)
            .hover((s) => s.bg(on ? t.done + "33" : t.hover))
            .tooltip(on ? `Disconnect ${label}` : `Add Agent Plans hooks to ${label}`)
            .on_click((_e, cx) => {
              if (this.busy) return;
              this.busy = id;
              this.checkHooks(cx, [on ? "disconnect" : "connect", id]);
            })
            .when(on, (el) => el.child("✓"))
            .child(this.busy === id ? "…" : label);
        })))
      .when(Boolean(this.hooks.codex?.connected), (el) => el.child(line("Approve once in Codex: /hooks")))
      .when(Boolean(err), (el) => el.child(err));
  }

  // Планы агентов показанного space: живые и недавно закрытые.
  forSpace(spaceId) {
    const terms = new Map(terminals().map((t) => [t.address, t]));
    const ags = new Map(agents().map((a) => [a.address, a]));
    return this.plans
      .map((p) => {
        const term = terms.get(p.terminal);
        const agent = ags.get(p.terminal);
        const space = agent?.space ?? term?.labels?.["herdr.space"] ?? null;
        return { ...p, term, agent, space, live: term?.state === "live" };
      })
      .filter((p) => p.space === spaceId && (p.live || Date.now() - (p.updated ?? 0) < STALE_MS))
      .sort((a, b) => (Number(b.live) - Number(a.live)) || ((b.updated ?? 0) - (a.updated ?? 0)));
  }

  // ---------- кнопка ----------

  renderButton(t) {
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    const on = Boolean(panel && !panel.hidden && body?.active === PANEL);
    return h_flex().size_full().items_center().justify_end().pr(10).bg(t.chrome).border_b(1).border_color(t.border)
      .child(
        h_flex().id("agent-plans-button").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
          .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
          .hover((s) => s.bg(t.hover))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => {
            if (on) run("layout.hide", { id: "panel" });
            else { run("layout.select", { stack: "panel-body", child: PANEL }); run("layout.show", { id: "panel" }); }
          })
          .child(svg(ICON).size(14))
          .child("Plan"),
      );
  }

  // ---------- панель ----------

  mark(t, status, spinning) {
    const box = () => div().size(18).flex_none().rounded(9).flex().items_center().justify_center();
    if (status === "completed") return box().bg(t.done).text_size(11).font_bold().text_color(t.background).child("✓");
    if (status === "in_progress")
      return spinning ? box().child(svg(SPINNER).size(16).text_color(t.working).spin(1100)) : box().border(2).border_color(t.working);
    return box().border(1.5).border_color(t.dim);
  }

  pill(t, status, live) {
    const make = (color, text) =>
      h_flex().flex_none().gap(5).items_center().px(8).h(22).rounded(11).bg(color + "1f")
        .child(div().size(6).rounded(3).bg(color))
        .child(div().text_size(12).text_color(color).child(text));
    if (!live) return make(t.dim, "closed");
    if (status === "working") return make(t.working, "working");
    if (status === "blocked") return make(t.blocked, "needs you");
    if (status === "done") return make(t.done, "done");
    return make(t.dim, "idle");
  }

  chips(t, list, selected, spaceId) {
    return h_flex().id("ap-chips").flex_none().gap(6).px(14).pb(10).flex_wrap().children(
      list.map((p) => {
        const on = p.key === selected.key;
        return h_flex().id(`ap-chip-${p.key}`).h(26).px(9).gap(6).items_center().rounded(13).cursor_pointer()
          .bg(on ? t.selected : t.surface).text_size(12).text_color(on ? t.foreground : t.muted)
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.pick[spaceId] = p.key; cx.notify(); })
          .child(programIcon(p.agent?.program ?? p.term?.program, 13, t.foreground))
          .child(div().max_w(120).truncate().child(p.agent?.tab_name || p.term?.where || p.key));
      }),
    );
  }

  stage(t, p, s, i, isOpen, spinning) {
    const items = Array.isArray(s.items) ? s.items : [];
    const current = s.status === "in_progress";
    const done = s.status === "completed";
    // У текущего шага Claude даёт форму «делаю …» (activeForm).
    const text = current && s.active ? s.active : s.text;
    const head = h_flex().gap(10).items_start()
      .child(div().pt(1).child(this.mark(t, s.status, spinning)))
      .child(div().flex_1().min_w(0).whitespace_normal().line_height(1.35).text_size(14)
        .text_color(done ? t.dim : current ? t.foreground : t.muted)
        .when(current, (el) => el.font_medium())
        .child(text || "—"))
      .when(items.length > 0, (el) => el.child(
        div().flex_none().pt(1).text_size(12).text_color(t.dim).child(isOpen ? "▾" : `${items.length} ▸`)));
    const card = v_flex().id(`ap-stage-${p.key}-${i}`).flex_none().gap(8).px(12).py(10).rounded(10)
      .bg(current ? t.raised : t.surface)
      .when(items.length > 0, (el) => el.cursor_pointer().hover((st) => st.bg(t.hover))
        .on_click((_e, cx) => { this.open[p.key] = isOpen ? null : i; cx.notify(); }))
      .child(head);
    if (isOpen && items.length)
      card.child(v_flex().gap(5).pl(28).children(items.map((it, j) =>
        h_flex().id(`ap-item-${p.key}-${i}-${j}`).gap(8).items_start()
          .child(div().flex_none().text_size(13).text_color(t.dim).child("•"))
          .child(div().flex_1().min_w(0).whitespace_normal().line_height(1.4).text_size(13)
            .text_color(done ? t.dim : t.muted).child(it)))));
    return card;
  }

  plan(t, p) {
    const steps = p.steps;
    const done = steps.filter((s) => s.status === "completed").length;
    const curIdx = steps.findIndex((s) => s.status === "in_progress");
    const status = p.agent?.status ?? (typeof p.term?.status === "string" ? p.term.status : null);
    const spinning = p.live && status === "working";
    const where = p.agent?.tab_name || p.term?.where || "";
    // Раскрыт один этап: выбранный кликом, иначе текущий.
    const openIdx = p.key in this.open ? this.open[p.key] : (curIdx >= 0 ? curIdx : null);
    const msg = spinning ? p.term?.report?.msg : null;
    const all = done === steps.length;

    return v_flex().gap(12)
      .child(
        v_flex().gap(8).px(4)
          .child(h_flex().gap(8).items_center()
            .child(programIcon(p.agent?.program ?? p.term?.program, 16, t.foreground))
            .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.muted)
              .child(where ? `${appName(p.app)} · ${where}` : appName(p.app)))
            .child(this.pill(t, status, p.live)))
          .when(Boolean(p.title), (el) => el.child(div().text_size(16).font_semibold().whitespace_normal()
            .line_height(1.3).text_color(t.foreground).child(clip(p.title, 140))))
          .child(h_flex().gap(10).items_center()
            .child(div().flex_none().text_size(12.5).text_color(t.muted).child(`${done} of ${steps.length}`))
            .child(div().flex_1().h(4).rounded(2).bg(t.border).child(
              div().h(4).rounded(2).bg(all ? t.done : t.working)
                .w(`${Math.max(2, Math.round((done / steps.length) * 100))}%`)))),
      )
      .child(v_flex().gap(6).children(steps.map((s, i) => this.stage(t, p, s, i, openIdx === i, spinning))))
      .child(h_flex().gap(8).px(4).text_size(12).text_color(t.dim)
        .child(div().flex_1().min_w(0).truncate().child(msg ? clip(msg, 90) : ""))
        .child(div().flex_none().child(`updated ${ago(p.updated ?? 0)}`)));
  }

  empty(t) {
    const line = (text, color = t.dim) => div().text_size(13).text_color(color).whitespace_normal().line_height(1.45).child(text);
    return v_flex().gap(10).px(6).py(4)
      .child(line("No plan in this space yet.", t.muted))
      .child(line("Approve a plan in Claude Code plan mode or Codex Plan Mode, and its stages show up here."));
  }

  render(cx) {
    const t = theme();
    if (this.button) return this.renderButton(t);
    const space = spaces().find((s) => s.active);
    const list = space ? this.forSpace(space.id) : [];
    // По умолчанию — агент в фокусе, иначе выбранный, иначе самый свежий.
    const f = focused();
    const focusedKey = list.find((p) => p.terminal && (p.terminal === f?.agent || p.terminal === f?.terminal))?.key;
    const pickedKey = space && list.some((p) => p.key === this.pick[space.id]) ? this.pick[space.id] : null;
    const selected = list.find((p) => p.key === (pickedKey ?? focusedKey)) ?? list[0];
    const row = this.connectRow(t);

    return v_flex().id("ap-root").size_full().bg(t.background).text_color(t.foreground)
      .child(h_flex().h(44).flex_none().pl(18).pr(10).gap(2).items_center()
        .child(div().flex_1().text_size(14).font_semibold().child("Plan"))
        .child(div().id("ap-agents").size(26).rounded(6).flex().items_center().justify_center()
          .text_color(this.showConnect ? t.foreground : t.dim).cursor_pointer().tooltip("Connected agents")
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { this.showConnect = !this.showConnect; cx.notify(); })
          .child(svg("mods/agent-plans/settings.svg").size(15)))
        .child(div().id("ap-repo").size(26).rounded(6).flex().items_center().justify_center()
          .text_color(t.dim).cursor_pointer().tooltip("Agent Plans on GitHub")
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => openLink(REPO))
          .child(svg("mods/agent-plans/github.svg").size(15)))
        .child(div().id("ap-close").size(26).rounded(6).flex().items_center().justify_center()
          .text_size(13).text_color(t.dim).cursor_pointer().tooltip("Hide panel")
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("layout.hide", { id: "panel" }))
          .child("✕")))
      .when(list.length > 1, (el) => el.child(this.chips(t, list, selected, space.id)))
      .child(v_flex().id("ap-scroll").flex_1().min_h(0).px(12).pb(12).overflow_y_scrollbar()
        .child(selected ? this.plan(t, selected) : this.empty(t)))
      .when(Boolean(row), (el) => el.child(row));
  }
}
