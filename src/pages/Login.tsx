import { useSession } from '../lib/session';
import kneelingWarrior from '../assets/brand/warrior-kneeling.png';

// The sign-in splash. The kneeling Warrior leads — a knight kneels to receive a
// charge, which is the whole idea of a steward. Microsoft 365 SSO is the only
// way in: a real Entra ID popup against the WCS tenant.
export default function Login() {
  const { signIn, signingIn, authError, configured } = useSession();
  return (
    <div className="signin">
      <img className="signin-hero" src={kneelingWarrior} alt="Westminster Warrior" />
      <div className="signin-mark">STEWARD</div>
      <div className="signin-rule" />
      <div className="signin-verse">1 Peter 4:10&ndash;11</div>

      <button
        className="signin-btn"
        onClick={() => void signIn()}
        disabled={!configured || signingIn}
      >
        <i
          className={signingIn ? 'ti ti-loader-2 signin-spin' : 'ti ti-brand-windows'}
          style={{ fontSize: 18 }}
        />
        {signingIn ? 'Opening Microsoft…' : 'Sign in with Microsoft 365'}
      </button>

      {/* Without an app registration the button can't do anything. Say so
          plainly rather than letting it fail silently on a click. */}
      {!configured && (
        <div className="signin-note">
          Microsoft sign-in isn&rsquo;t configured for this build yet.
        </div>
      )}
      {authError && <div className="signin-error">{authError}</div>}

      <div className="signin-foot">Westminster Christian School</div>
    </div>
  );
}
