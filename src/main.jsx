import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  PackageOpen,
  LogOut,
  Plus,
  Trash2,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
  ShieldCheck,
  Search,
  X,
  Users,
  EyeOff,
} from "lucide-react";
import "./styles.css";
// Keep authentication same-origin during local development. The Vite proxy
// forwards `/api` to FastAPI, so the browser can persist the Strict session
// cookie and send it back on subsequent requests.
const API = import.meta.env.VITE_API_URL || "/api";
const fmt = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
const labels = {
  fabrication: "Fabrication",
  busbar: "Busbar",
  switchgear: "Switchgear",
};
function App() {
  const [user, setUser] = useState(null),
    [authReady, setAuthReady] = useState(false),
    [projects, setProjects] = useState([]),
    [suppliers, setSuppliers] = useState([]),
    [pid, setPid] = useState(null),
    [tab, setTab] = useState("fabrication"),
    [login, setLogin] = useState({
      email: "",
      password: "",
    }),
    [error, setError] = useState(""),
    [modal, setModal] = useState("");
  const owner = user?.role === "owner";
  const api = async (path, opts = {}) => {
    let r = await fetch(API + path, {
      ...opts,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    let d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = Error(d.detail || `Request failed (${r.status})`);
      err.status = r.status;
      throw err;
    }
    return d;
  };
  const load = async () => {
    try {
      let [p, s] = await Promise.all([api("/projects"), api("/suppliers")]);
      setProjects(p);
      setSuppliers(s);
      setError("");
    } catch (e) {
      setError(e.message);
      // Only a genuine auth failure (expired/invalid session) should sign
      // the user out. A network hiccup or server error here used to nuke
      // a perfectly valid session and silently bounce back to the login
      // screen, which is why login could look like it "didn't work".
      if (e.status === 401) setUser(null);
    }
  };
  useEffect(() => {
    api("/auth/me")
      .then((data) => {
        setUser(data.user);
        return load();
      })
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);
  const project = projects.find((x) => x.id === pid);
  const signIn = async (e) => {
    e.preventDefault();
    try {
      let d = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(login),
      });
      setUser(d.user);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    setPid(null);
  };
  if (!authReady) return <div className="login">Loading secure session...</div>;
  if (!user)
    return (
      <div className="login">
        <div className="login-card">
          <div className="brand-mark">
            <PackageOpen size={27} />
          </div>
          <p className="eyebrow">PROJECT PURCHASE</p>
          <h1>Welcome back</h1>
          <p className="muted">Sign in to manage your project purchases.</p>
          <form onSubmit={signIn}>
            <label>
              Email
              <input
                type="email"
                value={login.email}
                onChange={(e) => setLogin({ ...login, email: e.target.value })}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={login.password}
                onChange={(e) =>
                  setLogin({ ...login, password: e.target.value })
                }
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary full">
              Sign in <ChevronRight size={17} />
            </button>
          </form>
          <div className="demo">
            <b>Demo credentials</b>
            <span>Owner: owner@purchase.app / owner123</span>
            <span>Employee: employee@purchase.app / employee123</span>
          </div>
        </div>
      </div>
    );
  const change = async (path, method, body) => {
    try {
      await api(path, { method, body: body && JSON.stringify(body) });
      await load();
    } catch (e) {
      alert(e.message);
    }
  };
  return (
    <>
      <Header user={user} logout={logout} />
      {error && (
        <div className="shell" style={{ padding: "24px 28px 0" }}>
          <div className="notice locked">
            <EyeOff size={19} />
            <span>Couldn't load your data: {error}</span>
            <button
              className="text-btn"
              onClick={() => {
                setError("");
                load();
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {!project ? (
        <main className="shell">
          <div className="page-top">
            <div>
              <p className="eyebrow">PROJECTS</p>
              <h1>Purchase overview</h1>
              <p className="muted">
                Select a project to work on its purchase records.
              </p>
            </div>
            {owner && (
              <div className="head-actions">
                <button className="soft" onClick={() => setModal("supplier")}>
                  <Users size={16} /> Supplier directory
                </button>
                <button className="primary" onClick={() => setModal("project")}>
                  <Plus size={17} /> New project
                </button>
              </div>
            )}
          </div>
          <div className="notice">
            <ShieldCheck size={19} />
            <span>
              {owner
                ? "Owner access — totals, supplier controls and project management are available. Switchgear suppliers are shared across every project."
                : "Choose a project and section to add a new purchase record."}
            </span>
          </div>
          <div className="projects">
            {projects.map((p) => (
              <button
                className="project-card"
                key={p.id}
                onClick={() => {
                  setPid(p.id);
                  setTab("fabrication");
                }}
              >
                <div className="project-icon">
                  <PackageOpen size={22} />
                </div>
                <div className="project-info">
                  <h3>{p.name}</h3>
                  <p>{p.client}</p>
                  <span
                    className={
                      "pill " + (p.status === "complete" ? "complete" : "")
                    }
                  >
                    {p.status === "complete" ? "Completed" : "In progress"}
                  </span>
                </div>
                {owner && (
                  <div className="project-total">
                    <small>Project total</small>
                    <b>{fmt(p.total)}</b>
                  </div>
                )}
                <ChevronRight className="arrow" />
              </button>
            ))}
          </div>
        </main>
      ) : (
        <Project
          project={project}
          owner={owner}
          suppliers={suppliers}
          tab={tab}
          setTab={setTab}
          back={() => setPid(null)}
          open={setModal}
          change={change}
        />
      )}{" "}
      {modal === "project" && (
        <ProjectModal
          close={() => setModal("")}
          save={async (x) => {
            await change("/projects", "POST", x);
            setModal("");
          }}
        />
      )}
      {modal === "supplier" && (
        <SupplierModal
          suppliers={suppliers}
          close={() => setModal("")}
          change={change}
        />
      )}{" "}
      {modal === "purchase" && (
        <PurchaseModal
          section={tab}
          suppliers={suppliers}
          close={() => setModal("")}
          save={async (x) => {
            await change(`/projects/${pid}/purchases/${tab}`, "POST", x);
            setModal("");
          }}
        />
      )}
    </>
  );
}
function Header({ user, logout }) {
  return (
    <header>
      <div className="logo">
        <span>
          <PackageOpen size={21} />
        </span>
        Project Purchase
      </div>
      <div className="user">
        <div className="avatar">
          {user.name
            .split(" ")
            .map((x) => x[0])
            .join("")}
        </div>
        <div>
          <b>{user.name}</b>
          <small>{user.role === "owner" ? "Owner" : "Employee"}</small>
        </div>
        <button title="Log out" onClick={logout}>
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
function Project({
  project,
  owner,
  suppliers,
  tab,
  setTab,
  back,
  open,
  change,
}) {
  const [filter, setFilter] = useState("all"),
    records = owner ? project.sections?.[tab] || [] : [];
  const shown =
    tab === "switchgear" && filter !== "all"
      ? records.filter((x) => x.supplier_id === Number(filter))
      : records;
  return (
    <main className="shell">
      <button className="back" onClick={back}>
        ← All projects
      </button>
      <div className="detail-head">
        <div>
          <p className="eyebrow">{project.client}</p>
          <h1>{project.name}</h1>
          <span
            className={
              "pill " + (project.status === "complete" ? "complete" : "")
            }
          >
            {project.status === "complete" ? "Completed" : "In progress"}
          </span>
        </div>
        {owner && (
          <div className="head-actions">
            {project.status === "active" && (
              <button
                className="soft"
                onClick={() =>
                  change(`/projects/${project.id}/complete`, "PATCH")
                }
              >
                <CheckCircle2 size={16} /> Complete project
              </button>
            )}
            <button
              className="danger-soft"
              onClick={() =>
                confirm("Delete this project?") &&
                change(`/projects/${project.id}`, "DELETE").then(back)
              }
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        )}
      </div>
      <div className="tabs">
        {Object.entries(labels).map(([id, n]) => (
          <button
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
            key={id}
          >
            {n}
          </button>
        ))}
      </div>
      {tab === "switchgear" && owner && (
        <div className="supplier-bar">
          <div className="filter">
            <Search size={16} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All suppliers</option>
              {suppliers.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {filter !== "all" && (
            <div className="subtotal">
              Subtotal:{" "}
              <strong>{fmt(shown.reduce((a, x) => a + x.price, 0))}</strong>
            </div>
          )}
          <button className="text-btn" onClick={() => open("supplier")}>
            <Users size={16} /> Manage suppliers
          </button>
        </div>
      )}
      <section className="records">
        <div className="records-head">
          <div>
            <h2>{labels[tab]} purchases</h2>
            <p>
              {owner
                ? "Track invoices and purchase amounts."
                : "Record a new purchase for this project section."}
            </p>
          </div>
          {project.status === "active" && (
            <button className="primary" onClick={() => open("purchase")}>
              <Plus size={17} /> Add purchase
            </button>
          )}
        </div>
        {!owner ? (
          <div className="empty locked-empty">
            <PackageOpen size={27} />
            <h3>Ready for your next entry</h3>
            <p>
              Use “Add purchase” to record a new {labels[tab].toLowerCase()}{" "}
              item.
            </p>
          </div>
        ) : shown.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice no.</th>
                  <th>Date</th>
                  <th>Description</th>
                  {tab === "fabrication" && <th>Weight</th>}
                  {tab === "switchgear" && <th>Supplier</th>}
                  <th className="right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.invoice}</b>
                    </td>
                    <td>{r.date}</td>
                    <td>{r.name}</td>
                    {tab === "fabrication" && <td>{r.weight}</td>}
                    {tab === "switchgear" && (
                      <td>
                        <span className="supplier-tag">{r.supplier}</span>
                      </td>
                    )}
                    <td className="right amount">{fmt(r.price)}</td>
                    <td>
                      <button
                        className="icon-danger"
                        onClick={() =>
                          confirm("Delete purchase?") &&
                          change(`/purchases/${r.id}`, "DELETE")
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table-total">
              Section total{" "}
              <strong>{fmt(shown.reduce((a, x) => a + x.price, 0))}</strong>
            </div>
          </div>
        ) : (
          <div className="empty">
            <PackageOpen size={30} />
            <h3>No purchases yet</h3>
            <p>Add the first {tab} purchase to this project.</p>
          </div>
        )}
      </section>
    </main>
  );
}
function PurchaseModal({ section, suppliers, close, save }) {
  const [v, setV] = useState({
    invoice: "",
    date: new Date().toISOString().slice(0, 10),
    name: "",
    weight: "",
    price: "",
    supplier_id: suppliers[0]?.id || "",
  });
  return (
    <div className="overlay">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          save({
            ...v,
            price: +v.price,
            supplier_id: v.supplier_id ? +v.supplier_id : null,
          });
        }}
      >
        <button type="button" className="close" onClick={close}>
          <X size={20} />
        </button>
        <p className="eyebrow">NEW PURCHASE</p>
        <h2>Add {labels[section]} record</h2>
        <div className="form-grid">
          <label>
            Invoice number
            <input
              required
              value={v.invoice}
              onChange={(e) => setV({ ...v, invoice: e.target.value })}
            />
          </label>
          <label>
            Invoice date
            <input
              required
              type="date"
              value={v.date}
              onChange={(e) => setV({ ...v, date: e.target.value })}
            />
          </label>
          <label className="span2">
            Description / name
            <input
              required
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </label>
          {section === "fabrication" && (
            <label>
              Weight
              <input
                value={v.weight}
                onChange={(e) => setV({ ...v, weight: e.target.value })}
              />
            </label>
          )}
          {section === "switchgear" && (
            <label className="span2">
              Select supplier
              <select
                required
                value={v.supplier_id}
                onChange={(e) => setV({ ...v, supplier_id: e.target.value })}
              >
                <option value="">Choose a supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Amount (₹)
            <input
              required
              min="0"
              type="number"
              value={v.price}
              onChange={(e) => setV({ ...v, price: e.target.value })}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="soft" onClick={close}>
            Cancel
          </button>
          <button className="primary">Save purchase</button>
        </div>
      </form>
    </div>
  );
}
function ProjectModal({ close, save }) {
  const [x, setX] = useState({ name: "", client: "" });
  return (
    <div className="overlay">
      <form
        className="modal small"
        onSubmit={(e) => {
          e.preventDefault();
          save(x);
        }}
      >
        <button type="button" className="close" onClick={close}>
          <X size={20} />
        </button>
        <p className="eyebrow">NEW PROJECT</p>
        <h2>Create project</h2>
        <label>
          Project name
          <input
            required
            value={x.name}
            onChange={(e) => setX({ ...x, name: e.target.value })}
          />
        </label>
        <label>
          Client / company
          <input
            required
            value={x.client}
            onChange={(e) => setX({ ...x, client: e.target.value })}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="soft" onClick={close}>
            Cancel
          </button>
          <button className="primary">Create project</button>
        </div>
      </form>
    </div>
  );
}
function SupplierModal({ suppliers, close, change }) {
  const [name, setName] = useState("");
  return (
    <div className="overlay">
      <div className="modal small">
        <button className="close" onClick={close}>
          <X size={20} />
        </button>
        <p className="eyebrow">GLOBAL CATALOGUE</p>
        <h2>Manage suppliers</h2>
        <p className="muted">
          These suppliers are shared by every project’s switchgear section.
        </p>
        <div className="add-supplier">
          <input
            placeholder="New supplier name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="primary"
            onClick={() =>
              name &&
              change("/suppliers", "POST", { name }).then(() => setName(""))
            }
          >
            Add
          </button>
        </div>
        <div className="supplier-list">
          {suppliers.map((s) => (
            <div key={s.id}>
              {s.name}
              <button
                className="icon-danger"
                onClick={() =>
                  confirm("Delete supplier?") &&
                  change(`/suppliers/${s.id}`, "DELETE")
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
