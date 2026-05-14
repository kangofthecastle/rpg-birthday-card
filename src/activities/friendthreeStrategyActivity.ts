import type { ActivityModule } from './activityTypes';

export const friendthreeStrategyActivity: ActivityModule = {
  id: 'friendthree-strategy-table',
  title: '____ Island',
  start({ mount, onCancel }) {
    mount.innerHTML = `
      <section class="activity-panel" role="dialog" aria-label="____ Island">
        <h2>____ Island</h2>
        <p>____ Island is being set up on the table.</p>
        <div class="activity-actions">
          <button type="button" data-activity-cancel>Return</button>
        </div>
      </section>
    `;

    mount
      .querySelector('[data-activity-cancel]')
      ?.addEventListener('click', onCancel, { once: true });
  },
};
