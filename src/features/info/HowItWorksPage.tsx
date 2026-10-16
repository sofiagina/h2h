import { m } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconChat, IconChevronRight, IconSearch, IconShield, IconSparkle, IconSwap, IconTicket, IconWallet } from '@/shared/ui/icons';
import { item, list } from '@/shared/lib/motion';

const WHY = [
  { Icon: IconShield, title: 'Надёжно', text: 'Билет проверяем у организатора, а покупателю он выпускает новый. По старому пройти уже нельзя.' },
  { Icon: IconSparkle, title: 'Просто', text: 'Продать билет можно за пару минут. Купленный билет сразу приходит на почту и в личный кабинет.' },
  { Icon: IconWallet, title: 'Честно', text: 'Только по номиналу: ни продавец, ни мы не зарабатываем на наценке.' },
];

const BUY = [
  { Icon: IconSearch, title: 'Найдите концерт', text: 'Даже если билеты распроданы: зрители, которые не могут пойти, выставляют свои.' },
  { Icon: IconTicket, title: 'Купите по номиналу', text: 'Цена не выше напечатанной на билете. Место держим 15 минут, пока вы платите.' },
  { Icon: IconSwap, title: 'Получите свой билет', text: 'Организатор аннулирует билет продавца и выпускает новый на ваше имя.' },
];

const SELL = [
  { Icon: IconTicket, title: 'Выставьте билет', text: 'Найдите концерт, укажите номер заказа и email, на который покупали.' },
  { Icon: IconWallet, title: 'Укажите, куда перевести', text: 'Карта, СБП или счёт. Цена — номинал, её не нужно придумывать.' },
  { Icon: IconChat, title: 'Ждите покупателя', text: 'Пока билет не купили, он ваш, и вы можете пойти на концерт сами.' },
  { Icon: IconSwap, title: 'Получите деньги', text: 'Пришлём уведомление о продаже, деньги придут сразу после оформления билета на покупателя.' },
];

const FAQ = [
  { q: 'Почему только по номиналу?', a: 'Мы против перекупщиков. Продавец возвращает свои деньги, покупатель не переплачивает.' },
  { q: 'Что если организатор не подключён?', a: 'Билет передаёт сам продавец, а деньги он получает только на следующий день после концерта. Если билет не сработает, откройте спор, и мы вернём деньги.' },
  { q: 'Сколько стоит?', a: 'Пока ничего: сервисного сбора нет ни для покупателя, ни для продавца.' },
  { q: 'Что если меня не пустят по билету?', a: 'Откройте спор в заказе и приложите фото или видео. Поддержка разберётся и вернёт деньги, если проблема подтвердится.' },
  { q: 'Можно передумать после выставления?', a: 'Да, пока билет не купили. Напишите в поддержку, и мы снимем его с продажи.' },
];

function Steps({ steps }: { steps: typeof BUY }) {
  return (
    <m.ol className="how-steps" variants={list} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
      {steps.map(({ Icon, title, text }, i) => (
        <m.li key={title} variants={item}>
          <span className="how-steps__icon"><Icon size={26} /></span>
          <span className="how-steps__num">{i + 1}</span>
          <b>{title}</b>
          <p>{text}</p>
        </m.li>
      ))}
    </m.ol>
  );
}

export function HowItWorksPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <section className="hero hero--small">
        <div className="hero__lights" aria-hidden />
        <div className="container hero__inner">
          <h1>Как это работает</h1>
          <p className="hero__lead">Покупайте и продавайте билеты по номиналу. Без перекупщиков и переводов незнакомцам.</p>
        </div>
      </section>

      <div className="container section how-page">
        <section className="block">
          <div className="block__head"><h2>Почему Hand2Hand</h2></div>
          <m.div className="why" variants={list} initial="hidden" whileInView="show" viewport={{ once: true }}>
            {WHY.map(({ Icon, title, text }) => (
              <m.div key={title} className="why__item" variants={item}>
                <Icon size={28} />
                <b>{title}</b>
                <p>{text}</p>
              </m.div>
            ))}
          </m.div>
        </section>

        <section className="block">
          <div className="block__head"><h2>Покупателям</h2></div>
          <Steps steps={BUY} />
        </section>

        <section className="block">
          <div className="block__head"><h2>Продавцам</h2></div>
          <Steps steps={SELL} />
        </section>

        <section className="block guarantee-band">
          <IconShield size={40} />
          <div>
            <b>Через организатора</b>
            <p>
              С организаторами-партнёрами мы работаем напрямую: при продаже старый билет аннулируется, а покупатель получает новый.
              Такие концерты отмечены значком «Через организатора».
            </p>
          </div>
        </section>

        <section className="block">
          <div className="block__head"><h2>Частые вопросы</h2></div>
          <div className="faq">
            {FAQ.map((f, i) => (
              <div key={f.q} className={`faq__item ${open === i ? 'open' : ''}`}>
                <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                  {f.q}
                  <IconChevronRight size={18} />
                </button>
                {open === i && (
                  <m.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                    {f.a}
                  </m.p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="block how-strip">
          <div>
            <b>Готовы?</b>
            <span>Найдите концерт или выставьте свой билет.</span>
          </div>
          <div className="actions">
            <Link to="/" className="btn btn--ghost btn--sm">Найти концерт</Link>
            <Link to="/sell" className="btn btn--primary btn--sm">Продать билет</Link>
          </div>
        </section>
      </div>
    </>
  );
}
