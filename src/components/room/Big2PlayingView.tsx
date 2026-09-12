"use client";

import PlayingTable, { type PlayingTableProps } from "./PlayingTable";

/** 大老二對局畫面入口，保留共用牌桌呈現與事件契約。 */
export default function Big2PlayingView(props: PlayingTableProps) {
  return <PlayingTable {...props} />;
}
