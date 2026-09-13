import { gameUrl } from '../engine/share.ts';
import { Modal } from './Modal.tsx';

export type InfoPage = 'about' | 'privacy' | 'contact';

const TITLES: Record<InfoPage, string> = {
  about: 'About',
  privacy: 'Privacy',
  contact: 'Contact',
};

/**
 * The standing pages a public site is expected to have. These are honest defaults
 * describing what this build actually does — notably that it collects nothing — and
 * the contact address is a placeholder to fill in before going live.
 */
const CONTACT_EMAIL = 'ysaimuppineni789@gmail.com';

function About() {
  return (
    <>
      <p>
        <strong>EVARRA?</strong> is a daily guessing game about Telugu cinema. One star
        a day, the same for everyone, starting almost entirely blurred. Five guesses.
        The photo clears a little with each wrong one, and the score drops with it.
      </p>
      <p>
        Photographs come from <a href="https://commons.wikimedia.org" target="_blank" rel="noreferrer noopener">Wikimedia
        Commons</a> and are used under their individual licences, with the source,
        licence and photographer credited on screen once a round ends. Biographical
        details and clues come from <a href="https://www.wikidata.org" target="_blank" rel="noreferrer noopener">Wikidata</a>,
        which releases its data under CC0. No film footage or stills are used.
      </p>
      <p>
        Clues are assembled from Wikidata statements when the game is built. Nothing is
        written by hand or generated about a real person while you play.
      </p>
      <p className="info__note">
        Not affiliated with any studio, production house or the people featured. If you
        appear here and would rather not, get in touch and the entry will be removed.
      </p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p>
        Short version: <strong>this game collects nothing about you.</strong> There are
        no accounts, no analytics, no advertising, no tracking pixels and no cookies.
      </p>
      <h3 className="info__heading">What is stored</h3>
      <p>
        Your puzzle progress, streak and statistics are kept in your own browser&apos;s
        local storage, on your device. They are never sent anywhere — which is also why
        they do not follow you to another browser, and why clearing your site data
        clears your streak.
      </p>
      <h3 className="info__heading">What leaves your device</h3>
      <p>
        Only the requests needed to load the page and its images. The site asks its own
        server for the current time so the daily puzzle cannot be skipped ahead by
        changing your device clock; no personal data is involved.
      </p>
      <p>
        Sharing a result opens your own device&apos;s share sheet, WhatsApp or X. What
        happens after that is covered by those services&apos; own policies.
      </p>
      <h3 className="info__heading">Hosting</h3>
      <p>
        The host serving this site may keep standard server logs, such as IP addresses
        and request times, for security and reliability. That is outside this
        game&apos;s control.
      </p>
      <p className="info__note">
        Because nothing is collected, there is nothing to request, export or delete —
        beyond clearing your browser&apos;s data for this site, which you can do at any
        time without asking anyone.
      </p>
    </>
  );
}

function Contact() {
  return (
    <>
      <p>
        Questions, a wrong photograph, a clue that is off, or a star who should or
        should not be here:
      </p>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="info__email">{CONTACT_EMAIL}</a>
      </p>
      <h3 className="info__heading">Corrections and removals</h3>
      <p>
        Every photograph is freely licensed and credited, but if you are pictured here
        and want the entry removed, say so and it will be taken out of the next build.
        The same goes for a misattributed photo or an incorrect clue — both come from
        public data that can be wrong.
      </p>
      <h3 className="info__heading">Copyright</h3>
      <p>
        If you believe something here infringes your rights, include the page, the image
        and enough detail to identify it, and it will be reviewed promptly.
      </p>
      <p className="info__note">
        Play the game at <a href={gameUrl()}>{gameUrl()}</a>
      </p>
    </>
  );
}

const PAGES: Record<InfoPage, () => React.JSX.Element> = {
  about: About,
  privacy: Privacy,
  contact: Contact,
};

export function InfoPanel({ page, onClose }: { page: InfoPage; onClose: () => void }) {
  const Body = PAGES[page];
  return (
    <Modal title={TITLES[page]} onClose={onClose}>
      <div className="info">
        <Body />
      </div>
    </Modal>
  );
}
