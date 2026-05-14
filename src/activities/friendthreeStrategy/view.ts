import { BOARD_EDGES, BOARD_HEXES, BOARD_NODES, getNode } from './board';
import {
  buildRoad,
  buildSettlement,
  getBuildableEdges,
  getBuildableNodes,
} from './rules';
import { scorePlayer } from './scoring';
import type {
  BoardEdge,
  FriendThreeStrategyState,
  EdgeId,
  NodeId,
  PlayerId,
  ResourceCounts,
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
  const lastAction = state.log.at(-1)?.message ?? '____ studies the opening road from the coast.';

  mount.innerHTML = `
    <section class="friendthree-tabletop" role="dialog" aria-label="____ Island">
      <header class="friendthree-tabletop__header">
        <div>
          <p class="friendthree-tabletop__eyebrow">Tabletop match</p>
          <h2>____ Island</h2>
        </div>
        <div class="friendthree-tabletop__turn">Turn ${state.turnNumber}</div>
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
          <div class="friendthree-log" aria-live="polite">${lastAction}</div>
          <div class="friendthree-actions">
            <button type="button" data-friendthree-cancel>Return</button>
          </div>
        </aside>
      </div>
    </section>
  `;

  for (const button of mount.querySelectorAll<HTMLButtonElement>('[data-friendthree-action]')) {
    button.addEventListener('click', () => {
      const action = button.dataset.friendthreeAction;
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

function applyAction(state: FriendThreeStrategyState, action: string): FriendThreeStrategyState {
  const [kind, id] = action.split(':') as ['build-road' | 'build-settlement', EdgeId | NodeId];

  if (kind === 'build-road') {
    return buildRoad(state, 'recipient', id as EdgeId);
  }

  return buildSettlement(state, 'recipient', id as NodeId);
}

function formatResources(resources: ResourceCounts): string {
  return `W ${resources.wood} / S ${resources.stone} / G ${resources.grain}`;
}

function toBoardXPct(value: number): string {
  return `${(value / 420) * 100}%`;
}

function toBoardYPct(value: number): string {
  return `${(value / 360) * 100}%`;
}
