import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InstrumentId } from "@/modules/score";
import { InstrumentIcon } from "@/modules/editor/ui/components/toolbar/InstrumentIcon";

/** The app's own instrument icon, as SVG markup. */
export const icon = (instrument: InstrumentId, size = 22) =>
  renderToStaticMarkup(React.createElement(InstrumentIcon, { instrument, size }));
