import styles from './CapybaraLoader.module.css';

/**
 * Capybara Loader Component
 * 可愛的水豚載入動畫元件
 * 靈感來源: Uiverse.io by Novaxlo
 */
export default function CapybaraLoader() {
  return (
    <div className={styles.capybaraloader}>
      <div className={styles.capybara}>
        <div className={styles.capyhead}>
          <div className={styles.capyear}>
            <div className={styles.capyear2}></div>
          </div>
          <div className={styles.capyear}></div>
          <div className={styles.capymouth}>
            <div className={styles.capylips}></div>
            <div className={styles.capylips}></div>
          </div>
          <div className={styles.capyeye}></div>
          <div className={styles.capyeye}></div>
        </div>
        <div className={styles.capyleg}></div>
        <div className={styles.capyleg2}></div>
        <div className={styles.capyleg2}></div>
        <div className={styles.capy}></div>
      </div>
      <div className={styles.loader}>
        <div className={styles.loaderline}></div>
      </div>
    </div>
  );
}
