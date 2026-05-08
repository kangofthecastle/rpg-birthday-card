import type { ActivityModule } from './activityTypes';

export const finalKeepsakeActivity: ActivityModule = {
  id: 'final-keepsake-reveal',
  title: 'Lantern Reveal',
  start({ mount, onComplete }) {
    if (!mount.isConnected) {
      document.body.appendChild(mount);
    }

    mount.innerHTML = `
      <section class="activity-panel activity-panel--final" role="dialog" aria-label="Lantern Reveal">
        <h2>Lantern Reveal</h2>
        <p>The flower, star, and key fit together around the lantern.</p>
        <div class="activity-actions">
          <button type="button" data-activity-complete>Light the lantern</button>
        </div>
      </section>
    `;

    mount
      .querySelector('[data-activity-complete]')
      ?.addEventListener('click', () =>
        onComplete({ locationId: 'final-spot', keepsakeId: 'ending-light' }),
      );
  },
};
