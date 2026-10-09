import nouvelle, sim, copy
base = nouvelle.cfg_v5
act = sim.cfg_premier_jet()
def poids_actuels(c):
    c['w'] = copy.deepcopy(act['w']); return c
def couts_actuels(c):
    c['ch'] = copy.deepcopy(act['ch']); c['maison'] = copy.deepcopy(act['maison']); c['inst'] = .2; return c
def loot_actuel(c):
    c['loot'] = copy.deepcopy(act['loot']); return c
variantes = {
    'v5': lambda: base(),
    'PA 180': lambda: base(pa_cible=180),
    'PA 225': lambda: base(pa_cible=225),
    'trajets 2/3/4': lambda: base(trajet=[2, 3, 4], vierge=2),
    'sac 12': lambda: base(bag=12),
    'poids actuels': lambda: poids_actuels(base()),
    'loot actuel': lambda: loot_actuel(base()),
    'faim/soif 16/20': lambda: base(faim=16, soif=20),
    'install 0.2': lambda: base(inst=.2),
    'sans regen PV maison': lambda: base(regen_pv_maison=0),
    'degats nuit max 5': lambda: base(ratio_max=.5),
    'fuite 75/50': lambda: base(fuite=[.75, .5]),
    'attaque 15/10%': lambda: base(att_base=15, att_croiss=.10),
    'stocks naturels actuels': lambda: base(nat_max=[100, 150, 200]),
    'chantiers actuels': lambda: couts_actuels(base()),
}

def mini(**kw):
    c = base(regen_pv_maison=0, ratio_max=.5)
    for k, v in kw.items(): c[k] = v
    return nouvelle.appliquer_inst(c)
variantes.update({
    'mini (sac20, poids v5)': lambda: mini(),
    'mini sac12 poids actuels': lambda: poids_actuels(mini(bag=12)),
    'mini sac16 poids actuels': lambda: poids_actuels(mini(bag=16)),
    'mini sac20 poids actuels': lambda: poids_actuels(mini(bag=20)),
    'mini trajets 2/3/4': lambda: mini(trajet=[2, 3, 4], vierge=2),
    'mini install 0.2': lambda: mini(inst=.2),
})

import sys
sel = sys.argv[1:] or list(variantes)
for nom in sel:
    c = variantes[nom]()
    out, _ = sim.stats(c, [(15, 'bonne')], runs=14)
    o = out[0]
    out2, _ = sim.stats(c, [(15, 'moyenne')], runs=14)
    m = out2[0]
    print(f"{nom:24s} bonne: percee {o['percee']:>4} moitie {o['moitie']:>4} morts10 {o['morts10']:.1f} | moyenne: percee {m['percee']:>4} moitie {m['moitie']:>4} morts10 {m['morts10']:.1f}", flush=True)
