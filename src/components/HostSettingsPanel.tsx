"use client";

import { useState } from "react";
import {
  SIDE_BET_LABELS,
  SPECIAL_HAND_LABELS,
  type HostSettings,
  type SideBetId,
  type SpecialHandId,
} from "@/lib/game";
import { GhostButton, NumberField, Panel, SectionTitle, Toggle } from "./ui";

export function HostSettingsPanel({
  settings,
  onChange,
}: {
  settings: HostSettings;
  onChange: (patch: Partial<HostSettings>) => void;
}) {
  const [dragId, setDragId] = useState<SpecialHandId | null>(null);

  const toggleSpecial = (id: SpecialHandId, v: boolean) =>
    onChange({ enabledSpecials: { ...settings.enabledSpecials, [id]: v } });
  const toggleSide = (id: SideBetId, v: boolean) =>
    onChange({ enabledSideBets: { ...settings.enabledSideBets, [id]: v } });

  const reorder = (from: SpecialHandId, to: SpecialHandId) => {
    if (from === to) return;
    const order = settings.specialOrder.slice();
    const fromIdx = order.indexOf(from);
    const toIdx = order.indexOf(to);
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, from);
    onChange({ specialOrder: order });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <SectionTitle>Banker & Rounds</SectionTitle>
        <div className="mb-4 flex gap-2">
          <GhostButton
            active={settings.bankerRotation === "fixed"}
            onClick={() => onChange({ bankerRotation: "fixed" })}
          >
            Fixed Rotation
          </GhostButton>
          <GhostButton
            active={settings.bankerRotation === "winner-stays"}
            onClick={() => onChange({ bankerRotation: "winner-stays" })}
          >
            Winner Stays
          </GhostButton>
        </div>
        <NumberField
          label="Round Timer (seconds, 0 = off)"
          value={settings.roundTimerSeconds}
          min={0}
          step={5}
          onChange={(v) => onChange({ roundTimerSeconds: v ?? 0 })}
        />
        <NumberField
          label="Reconnect Timer (seconds)"
          value={settings.reconnectSeconds ?? 60}
          min={10}
          step={5}
          onChange={(v) => onChange({ reconnectSeconds: v ?? 60 })}
        />
      </Panel>

      <Panel>
        <SectionTitle>Betting Limits</SectionTitle>
        <p className="mb-3 text-xs text-slate-500">
          The pot is fixed by the host: an initial bet for the first round, then the progressive pot
          each round after.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="First-Round Initial Bet"
            value={settings.mandatoryPot}
            min={0}
            onChange={(v) => onChange({ mandatoryPot: v ?? 0 })}
          />
          <NumberField
            label="Progressive Pot (round 2+)"
            value={settings.minPotBet}
            min={0}
            onChange={(v) => onChange({ minPotBet: v ?? 0 })}
          />
          <NumberField
            label="Min Personal Bet"
            value={settings.minPersonalBet}
            min={0}
            onChange={(v) => onChange({ minPersonalBet: v ?? 0 })}
          />
          <NumberField
            label="Max Personal Bet"
            value={settings.maxPersonalBet}
            min={0}
            placeholder="none"
            onChange={(v) => onChange({ maxPersonalBet: v })}
          />
        </div>
      </Panel>

      <Panel>
        <SectionTitle>House Rules</SectionTitle>
        <Toggle
          label="Scoop Bonus"
          checked={settings.scoopBonus}
          onChange={(v) => onChange({ scoopBonus: v })}
          hint="Extra reward when the banker scoops."
        />
        {settings.scoopBonus ? (
          <div className="mb-2 pl-1">
            <NumberField
              label="Scoop Bonus (per challenger)"
              value={settings.scoopBonusAmount}
              min={0}
              onChange={(v) => onChange({ scoopBonusAmount: v ?? 0 })}
            />
          </div>
        ) : null}
        <Toggle
          label="Foul Penalty"
          checked={settings.foulPenalty}
          onChange={(v) => onChange({ foulPenalty: v })}
          hint="Fixed penalty for an invalid arrangement."
        />
        {settings.foulPenalty ? (
          <div className="mb-2 pl-1">
            <NumberField
              label="Foul Penalty amount"
              value={settings.foulPenaltyAmount}
              min={0}
              onChange={(v) => onChange({ foulPenaltyAmount: v ?? 0 })}
            />
          </div>
        ) : null}
        <Toggle
          label="Allow Invalid Hand"
          checked={settings.allowInvalidHand}
          onChange={(v) => onChange({ allowInvalidHand: v })}
          hint="Off = invalid arrangements are blocked before submit."
        />
        <Toggle
          label="Suit Ranking"
          checked={settings.suitRanking}
          onChange={(v) => onChange({ suitRanking: v })}
          hint={"Break otherwise-equal hands by suit (\u2660>\u2665>\u2663>\u2666)."}
        />
      </Panel>

      <Panel>
        <SectionTitle>Side Bets</SectionTitle>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(SIDE_BET_LABELS) as SideBetId[]).map((id) => (
            <div key={id} className="rounded-lg border border-white/10 bg-white/5 px-3">
              <Toggle
                label={SIDE_BET_LABELS[id]}
                checked={settings.enabledSideBets[id]}
                onChange={(v) => toggleSide(id, v)}
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="lg:col-span-2">
        <SectionTitle>Special Hands — enable & drag to rank</SectionTitle>
        <p className="mb-3 text-xs text-slate-500">
          Top of the list = strongest. The banker wins ties between equal specials.
        </p>
        <ul className="grid gap-1.5">
          {settings.specialOrder.map((id, i) => (
            <li
              key={id}
              draggable
              onDragStart={() => setDragId(id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) reorder(dragId, id);
                setDragId(null);
              }}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                settings.enabledSpecials[id]
                  ? "border-white/10 bg-white/5"
                  : "border-white/5 bg-black/20 opacity-60"
              } ${dragId === id ? "border-gold/60" : ""}`}
            >
              <span className="flex items-center gap-3">
                <span className="cursor-grab text-slate-500">☰</span>
                <span className="w-6 text-xs font-semibold text-gold/70">#{i + 1}</span>
                <span className="text-sm text-slate-200">{SPECIAL_HAND_LABELS[id]}</span>
              </span>
              <Toggle
                label=""
                checked={settings.enabledSpecials[id]}
                onChange={(v) => toggleSpecial(id, v)}
              />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
