import type { ActivityModule } from './activityTypes';

export const friendCActivity: ActivityModule = {
  id: 'friend-c-song-line',
  title: 'Missing Melody',
  start({ mount, onComplete }) {
    mount.innerHTML = `
      <section class="activity-panel" role="dialog" aria-label="Missing Melody">
        <h2>Missing Melody</h2>
        <p>Put the last note where the room starts humming along.</p>
        <div class="activity-actions">
          <button type="button" data-activity-complete>Place the final note</button>
        </div>
      </section>
    `;

    mount
      .querySelector('[data-activity-complete]')
      ?.addEventListener('click', () =>
        onComplete({ locationId: 'friend-c', keepsakeId: 'tiny-key' }),
        { once: true },
      );
  },
};
