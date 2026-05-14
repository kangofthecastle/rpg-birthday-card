import { BOARD_EDGES, BOARD_HEXES, BOARD_NODES, getNode } from './board';
import { chooseFriendThreeAction } from './ai';
import { createSeededRandom } from './rng';
import {
  buildRoad,
  buildSettlement,
  endTurn,
  getBuildableEdges,
  getBuildableNodes,
  getScriptedRoll,
  rollProduction,
} from './rules';
import { scorePlayer } from './scoring';
import { applyBankTrade, canBankTrade } from './trade';
import type {
  BoardEdge,
  FriendThreeStrategyState,
  EdgeId,
  NodeId,
  PlayerId,
  ResourceCounts,
  ResourceType,
} from './types';

interface FriendThreeStrategyViewCallbacks {
  readonly onStateChange: (state: FriendThreeStrategyState) => void;
  readonly onComplete: (won: boolean) => void;
  readonly onCancel?: () => void;
}

const PLAYER_LABELS: Record<PlayerId, string> = {
  recipient: '____',
  friendthree: '____',
};
const RESOURCE_TYPES = ['wood', 'stone', 'grain'] as const;

type ParsedFriendThreeAction =
  | { readonly type: 'roll' }
  | { readonly type: 'end-turn' }
  | { readonly type: 'build-road'; readonly edgeId: EdgeId }
  | { readonly type: 'build-settlement'; readonly nodeId: NodeId }
  | { readonly type: 'trade'; readonly source: ResourceType; readonly target: ResourceType };

export function renderFriendThreeStrategyView(
  mount: HTMLElement,
  state: FriendThreeStrategyState,
  callbacks: FriendThreeStrategyViewCallbacks,
): () => void {
  let finished = false;
  const lifecycle = {
    finish: () => {
      finished = true;
      mount.innerHTML = '';
    },
    isFinished: () => finished,
  };

  render(mount, state, callbacks, lifecycle);

  return () => {
    finished = true;
    mount.innerHTML = '';
  };
}

interface ViewLifecycle {
  readonly finish: () => void;
  readonly isFinished: () => boolean;
}

function render(
  mount: HTMLElement,
  state: FriendThreeStrategyState,
  callbacks: FriendThreeStrategyViewCallbacks,
  lifecycle: ViewLifecycle,
): void {
  if (lifecycle.isFinished()) {
    return;
  }

  const buildableEdges = new Set(getBuildableEdges(state, 'recipient'));
  const buildableNodes = new Set(getBuildableNodes(state, 'recipient'));
  const alreadyRolled = hasRolledThisTurn(state);
  const lastAction = state.log.at(-1)?.message ?? '____ studies the opening road from the coast.';

  mount.innerHTML = `
    <section class="friendthree-tabletop" role="dialog" aria-label="____ Island">
      <header class="friendthree-tabletop__header">
        <div>
          <p class="friendthree-tabletop__eyebrow">Tabletop match</p>
          <h2>____ Island</h2>
        </div>
        <div class="friendthree-tabletop__turn">Turn ${state.turnNumber} · ${PLAYER_LABELS[state.currentPlayer]}</div>
      </header>

      <div class="friendthree-tabletop__opponent" aria-label="Opponent">
        <div class="friendthree-tabletop__avatar" aria-hidden="true">C</div>
        <div>
          <strong>____</strong>
          <span>Score ${scorePlayer(state, 'friendthree')} · ${formatResources(state.resources.friendthree)}</span>
        </div>
      </div>

      <div class="friendthree-tabletop__play">
        <div class="friendthree-board" aria-label="____ Island board">
          <div class="friendthree-board__map">
            ${BOARD_HEXES.map((hex) => {
              const x = hex.q * 100 + hex.r * 48 + 36;
              const y = hex.r * 82 + 44;

              return `
                <div
                  class="friendthree-hex friendthree-hex--${hex.resource}"
                  style="--x-pct: ${toBoardXPct(x)}; --y-pct: ${toBoardYPct(y)};"
                >
                  <span>${hex.resource}</span>
                  <strong>${hex.roll}</strong>
                </div>
              `;
            }).join('')}
            ${BOARD_EDGES.map((edge) => renderEdge(edge, state, buildableEdges)).join('')}
            ${BOARD_NODES.map(
              (node) => {
                const settlement = state.settlements.find((candidate) => candidate.nodeId === node.id);
                const ownerClass = settlement ? ` friendthree-node--${settlement.owner}` : '';

                return `
                  <button
                    class="friendthree-node${ownerClass}"
                    type="button"
                    style="--x-pct: ${toBoardXPct(node.x)}; --y-pct: ${toBoardYPct(node.y)};"
                    data-friendthree-action="build-settlement:${node.id}"
                    ${buildableNodes.has(node.id) && !state.winner ? '' : 'disabled'}
                    aria-label="Build settlement at ${node.id}"
                  >
                    <span>${settlement ? PLAYER_LABELS[settlement.owner].charAt(0) : node.id.replace('n', '')}</span>
                  </button>
                `;
              },
            ).join('')}
          </div>
        </div>

        <aside class="friendthree-tabletop__panel" aria-label="____ controls">
          <div class="friendthree-score-row">
            ${renderPlayerSummary('recipient', state)}
          </div>
          <div class="friendthree-resource-row" aria-label="____ resources">
            ${renderResourceBadges(state.resources.recipient)}
          </div>
          <div class="friendthree-resource-compact">____: ${formatCompactResources(state.resources.recipient)}</div>
          <div class="friendthree-log" aria-live="polite">${lastAction}</div>
          <div class="friendthree-actions">
            <button type="button" data-friendthree-action="roll" ${state.winner || alreadyRolled ? 'disabled' : ''}>Roll</button>
            <button type="button" data-friendthree-action="end-turn" ${state.winner ? 'disabled' : ''}>End Turn</button>
            ${renderTradeButton(state, 'wood', 'grain', 'Wood to grain')}
            ${renderTradeButton(state, 'stone', 'grain', 'Stone to grain')}
            ${renderTradeButton(state, 'grain', 'wood', 'Grain to wood')}
            ${renderTradeButton(state, 'grain', 'stone', 'Grain to stone')}
            <button type="button" class="friendthree-actions__return" data-friendthree-cancel>Return</button>
          </div>
        </aside>
      </div>
    </section>
  `;

  for (const button of mount.querySelectorAll<HTMLButtonElement>('[data-friendthree-action]')) {
    button.addEventListener('click', () => {
      const action = parseFriendThreeAction(button.dataset.friendthreeAction);
      if (!action || state.winner || lifecycle.isFinished()) {
        return;
      }

      const nextState = applyAction(state, action);
      callbacks.onStateChange(nextState);

      if (nextState.winner) {
        lifecycle.finish();
        callbacks.onComplete(nextState.winner === 'recipient');
        return;
      }

      render(mount, nextState, callbacks, lifecycle);
    });
  }

  mount
    .querySelector<HTMLButtonElement>('[data-friendthree-cancel]')
    ?.addEventListener('click', () => {
      if (lifecycle.isFinished()) {
        return;
      }

      callbacks.onCancel?.();
    }, { once: true });
}

function renderEdge(
  edge: BoardEdge,
  state: FriendThreeStrategyState,
  buildableEdges: ReadonlySet<EdgeId>,
): string {
  const [a, b] = edge.nodeIds.map((nodeId) => getNode(nodeId));
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const road = state.roads.find((candidate) => candidate.edgeId === edge.id);
  const ownerClass = road ? ` friendthree-edge--${road.owner}` : '';

  return `
    <button
      class="friendthree-edge${ownerClass}"
      type="button"
      style="--x-pct: ${toBoardXPct(x)}; --y-pct: ${toBoardYPct(y)}; --length-pct: ${toBoardXPct(length)}; --angle: ${angle}rad;"
      data-friendthree-action="build-road:${edge.id}"
      ${buildableEdges.has(edge.id) && !state.winner ? '' : 'disabled'}
      aria-label="Build road at ${edge.id}"
    >
      <span>${edge.id}</span>
    </button>
  `;
}

function renderPlayerSummary(player: PlayerId, state: FriendThreeStrategyState): string {
  const longestRoad = state.longestRoadOwner === player ? ' · Longest road' : '';

  return `
    <div>
      <strong>${PLAYER_LABELS[player]}</strong>
      <span>Score ${scorePlayer(state, player)}${longestRoad}</span>
    </div>
  `;
}

function renderResourceBadges(resources: ResourceCounts): string {
  return (['wood', 'stone', 'grain'] as const)
    .map(
      (resource) => `
        <span class="friendthree-resource friendthree-resource--${resource}">
          <span>${resource}</span>
          <strong>${resources[resource]}</strong>
        </span>
      `,
    )
    .join('');
}

function renderTradeButton(
  state: FriendThreeStrategyState,
  source: ResourceType,
  target: ResourceType,
  label: string,
): string {
  return `
    <button
      type="button"
      data-friendthree-action="trade:${source}:${target}"
      ${canBankTrade(state, 'recipient', source, target) && !state.winner ? '' : 'disabled'}
    >
      ${label}
    </button>
  `;
}

function applyAction(state: FriendThreeStrategyState, action: ParsedFriendThreeAction): FriendThreeStrategyState {
  if (action.type === 'roll') {
    if (hasRolledThisTurn(state)) {
      return state;
    }

    return rollProduction(state, getScriptedRoll(state.turnNumber));
  }

  if (action.type === 'end-turn') {
    const afterRecipient = endTurn(state);
    return resolveFriendThreeTurn(afterRecipient);
  }

  if (action.type === 'trade') {
    if (!canBankTrade(state, 'recipient', action.source, action.target)) {
      return state;
    }

    return applyBankTrade(state, 'recipient', action.source, action.target);
  }

  if (action.type === 'build-road') {
    return buildRoad(state, 'recipient', action.edgeId);
  }

  return buildSettlement(state, 'recipient', action.nodeId);
}

function parseFriendThreeAction(action: string | undefined): ParsedFriendThreeAction | undefined {
  if (action === 'roll') {
    return { type: 'roll' };
  }

  if (action === 'end-turn') {
    return { type: 'end-turn' };
  }

  const [kind, first, second, extra] = action?.split(':') ?? [];
  if (extra !== undefined || first === undefined) {
    return undefined;
  }

  if (kind === 'build-road' && second === undefined && isEdgeId(first)) {
    return { type: 'build-road', edgeId: first };
  }

  if (kind === 'build-settlement' && second === undefined && isNodeId(first)) {
    return { type: 'build-settlement', nodeId: first };
  }

  if (kind === 'trade' && second !== undefined && isResourceType(first) && isResourceType(second)) {
    if (first === second) {
      return undefined;
    }

    return { type: 'trade', source: first, target: second };
  }

  return undefined;
}

function resolveFriendThreeTurn(state: FriendThreeStrategyState): FriendThreeStrategyState {
  let nextState = rollProduction(state, getScriptedRoll(state.turnNumber));
  const action = chooseFriendThreeAction(nextState, createSeededRandom(nextState.turnNumber));

  if (action.type === 'build-road' && getBuildableEdges(nextState, 'friendthree').includes(action.edgeId)) {
    nextState = buildRoad(nextState, 'friendthree', action.edgeId);
  }

  if (action.type === 'build-settlement' && getBuildableNodes(nextState, 'friendthree').includes(action.nodeId)) {
    nextState = buildSettlement(nextState, 'friendthree', action.nodeId);
  }

  if (action.type === 'trade' && canBankTrade(nextState, 'friendthree', action.from, action.to)) {
    nextState = applyBankTrade(nextState, 'friendthree', action.from, action.to);
  }

  return endTurn(nextState);
}

function hasRolledThisTurn(state: FriendThreeStrategyState): boolean {
  return state.lastRoll === getScriptedRoll(state.turnNumber);
}

function isEdgeId(value: string): value is EdgeId {
  return BOARD_EDGES.some((edge) => edge.id === value);
}

function isNodeId(value: string): value is NodeId {
  return BOARD_NODES.some((node) => node.id === value);
}

function isResourceType(value: string): value is ResourceType {
  return RESOURCE_TYPES.includes(value as ResourceType);
}

function formatResources(resources: ResourceCounts): string {
  return `W ${resources.wood} / S ${resources.stone} / G ${resources.grain}`;
}

function formatCompactResources(resources: ResourceCounts): string {
  return `W${resources.wood} S${resources.stone} G${resources.grain}`;
}

function toBoardXPct(value: number): string {
  return `${(value / 420) * 100}%`;
}

function toBoardYPct(value: number): string {
  return `${(value / 360) * 100}%`;
}
