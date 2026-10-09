import nouvelle, sim
c = nouvelle.cfg_finale()
res = {}
for n in [15, 10, 7, 5]:
    for q in ['excellente', 'bonne', 'moyenne', 'faible']:
        out, _ = sim.stats(c, [(n, q)], runs=30)
        sim.afficher(f'finale {n} {q}', out)
        res[f'{n}-{q}'] = out[0]
out, _ = sim.stats(c, [(15, 'bonne'), (15, 'moyenne'), (12, 'moyenne')], runs=20)
sim.afficher('finale groupe de 3 villes', out)
res['groupe'] = out
act = sim.cfg_premier_jet()
for q in ['excellente', 'moyenne']:
    out, _ = sim.stats(act, [(15, q)], runs=20)
    sim.afficher(f'premier jet 15 {q}', out)
    res[f'premier-jet-{q}'] = out[0]
