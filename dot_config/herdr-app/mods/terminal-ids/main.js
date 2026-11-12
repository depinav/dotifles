import { View } from "gpui-kit";
import { props } from "herdr";
import Agents from "./agents.js";
import Pane from "./pane.js";

// Each layout slot owns its view and lifecycle; the sort popup is an agents view.
export default class TerminalIds extends View {
  init(options, cx) {
    const Content = props()?.role === "agents" ? Agents : Pane;
    this.content = new Content();
    this.content.init(options, cx);
  }

  render(cx) {
    return this.content.render(cx);
  }
}
