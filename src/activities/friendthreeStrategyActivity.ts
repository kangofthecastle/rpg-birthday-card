import type { ActivityModule } from './activityTypes';
import { createInitialMatchState } from './friendthreeStrategy/board';
import { renderFriendThreeStrategyView } from './friendthreeStrategy/view';

export const friendthreeStrategyActivity: ActivityModule = {
  id: 'friendthree-strategy-table',
  title: '____ Island',
  start({ mount, onCancel, onComplete }) {
    let completed = false;
    let cleanup = () => {
      mount.innerHTML = '';
    };

    cleanup = renderFriendThreeStrategyView(mount, createInitialMatchState(), {
      onStateChange: () => undefined,
      onComplete: (won) => {
        if (completed) {
          return;
        }

        completed = true;
        onComplete({
          activityId: 'friendthree-strategy-table',
          locationId: 'friend-c',
          won,
        });
      },
      onCancel: () => {
        if (completed) {
          return;
        }

        completed = true;
        cleanup();
        onCancel();
      },
    });
  },
};
