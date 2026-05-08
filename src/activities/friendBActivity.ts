import type { ActivityModule } from './activityTypes';

export const friendBActivity: ActivityModule = {
  id: 'friend-b-paper-stars',
  title: 'Paper Stars',
  start({ mount, onComplete }) {
    mount.innerHTML = `
      <section class="activity-panel" role="dialog" aria-label="Paper Stars">
        <h2>Paper Stars</h2>
        <p>Fold the scattered paper into one bright star.</p>
        <div class="activity-actions">
          <button type="button" data-activity-complete>Fold the final point</button>
        </div>
      </section>
    `;

    mount
      .querySelector('[data-activity-complete]')
      ?.addEventListener('click', () =>
        onComplete({ locationId: 'friend-b', keepsakeId: 'paper-star' }),
        { once: true },
      );
  },
};
