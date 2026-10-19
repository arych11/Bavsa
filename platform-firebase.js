// Firebase (free Spark plan): Google sign-in, saved profiles and class chats.
import { FIREBASE_CONFIG } from "./firebase-config.js";

const V = "10.12.2";
const sample = window.__bavsaSample || null;
const provide = s => window.__bavsaProvide(s);

const configured = FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && !String(FIREBASE_CONFIG.apiKey).startsWith("PASTE");
if (!configured) {
  console.warn("BAVSA: add your Firebase settings to firebase-config.js to turn on sign-in and class chats.");
  window.bavsaAuth = { available: false };
  provide({ db: null, user: null, sample });
} else {
  try {
    const [{ initializeApp }, A, F] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
    ]);
    const app = initializeApp(FIREBASE_CONFIG);
    const auth = A.getAuth(app), fs = F.getFirestore(app);
    const current = await new Promise(res => { const off = A.onAuthStateChanged(auth, u => { off(); res(u); }); });

    // Errors in the shape the app already understands
    const wrapErr = e => { const x = new Error(e && e.message || "error"); x.code = e && e.code === "permission-denied" ? "invalid_argument" : e && e.code === "resource-exhausted" ? "quota_exceeded" : (e && e.code) || "error"; return x; };
    const guard = p => p.catch(e => { throw wrapErr(e); });
    const snapOf = s => ({ id: s.id, exists: s.exists(), data: () => s.data() });
    const docApi = path => {
      const r = F.doc(fs, path);
      return { id: r.id, path,
        get: () => guard(F.getDoc(r).then(snapOf)),
        set: d => guard(F.setDoc(r, d)),
        update: d => guard(F.updateDoc(r, d)),
        delete: () => guard(F.deleteDoc(r)),
        collection: c => collApi(`${path}/${c}`) };
    };
    const collApi = (path, cons = []) => {
      const c = F.collection(fs, path);
      return {
        orderBy: (field, dir) => collApi(path, [...cons, F.orderBy(field, dir === "desc" ? "desc" : "asc")]),
        limit: n => collApi(path, [...cons, F.limit(n)]),
        where: (f, op, v) => collApi(path, [...cons, F.where(f, op === "eq" ? "==" : op, v)]),
        doc: id => docApi(id ? `${path}/${id}` : F.doc(c).path),
        add: d => guard(F.addDoc(c, d).then(r => docApi(r.path))),
        get: () => guard(F.getDocs(F.query(c, ...cons)).then(q => ({ docs: q.docs.map(snapOf), size: q.size, empty: q.empty }))),
        onSnapshot: (cb, onErr) => F.onSnapshot(F.query(c, ...cons),
          q => cb({ docs: q.docs.map(snapOf), size: q.size, empty: q.empty, docChanges: () => [], metadata: {} }),
          e => onErr && onErr(wrapErr(e)))
      };
    };
    const db = { doc: docApi, collection: collApi };

    // Public profile: first name + photo only, so classmates see who wrote a message
    const first = n => String(n || "").trim().split(/\s+/)[0] || "Student";
    if (current) {
      try { await F.setDoc(F.doc(fs, `profiles/${current.uid}`), { name: first(current.displayName), avatarUrl: current.photoURL || "", t: Date.now() }, { merge: true }); } catch {}
    }
    const user = current ? {
      id: async () => current.uid,
      can: async () => true,
      me: async () => ({ id: current.uid, name: current.displayName || "", avatarUrl: current.photoURL || "" }),
      profiles: async ids => {
        const out = {};
        await Promise.all([...new Set(ids)].slice(0, 60).map(async id => {
          try { const s = await F.getDoc(F.doc(fs, `profiles/${id}`)); out[id] = s.exists() ? { id, ...s.data() } : { id, name: "", avatarUrl: "" }; }
          catch { out[id] = { id, name: "", avatarUrl: "" }; }
        }));
        return out;
      }
    } : null;

    window.bavsaAuth = {
      available: true,
      signedIn: !!current,
      name: current ? current.displayName : "",
      signIn: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()).then(() => location.reload()).catch(e => { if (e && e.code !== "auth/popup-closed-by-user") alert("Sign-in didn’t work: " + (e.message || e)); }),
      signOut: () => A.signOut(auth).then(() => location.reload())
    };
    provide({ db, user, sample });
  } catch (e) {
    console.error("BAVSA: Firebase failed to start", e);
    window.bavsaAuth = { available: false };
    provide({ db: null, user: null, sample });
  }
}
