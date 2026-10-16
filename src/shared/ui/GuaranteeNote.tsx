/** Плашка о том, как защищена покупка: зависит от того, подключён ли организатор. */
export function GuaranteeNote({ organizer }: { organizer: boolean }) {
  return organizer ? (
    <div className="guarantee guarantee--ok">
      <strong>Билет оформит организатор</strong>
      <span>Старый билет аннулируют, новый выпустят на ваше имя.</span>
    </div>
  ) : (
    <div className="guarantee guarantee--warn">
      <strong>Организатор не подключён</strong>
      <span>Билет передаёт продавец. Он получит деньги только после концерта, а если билет не сработает, мы вернём их вам.</span>
    </div>
  );
}
