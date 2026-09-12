"use client";

import PlayingTable, { type PlayingTableProps } from "./PlayingTable";

/** 鬥地主對局畫面入口，保留共用牌桌呈現與事件契約。 */
export default function LandlordPlayingView(props: PlayingTableProps) {
  return <PlayingTable {...props} />;
}
