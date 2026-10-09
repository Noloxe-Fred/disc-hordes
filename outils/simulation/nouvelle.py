# Configurations successives du reequilibrage du 2026-10-10 ; cfg_finale = valeurs en jeu (equilibrage.md)
import sim, copy, sys, statistics


def palissade(bois, fer, k_pa=0.2):
    return [({'Bois': b, 'Ferraille': f}, max(1, round((b + f) * k_pa))) for b, f in zip(bois, fer)]


def cfg_v1(**kw):
    c = sim.cfg_premier_jet()
    c['pa_cible'] = 270; c['pa_cap'] = 40
    c['bag'] = 20; c['bank'] = [50, 100, 200]
    W = c['w']
    for n in ['Bois', 'Ferraille', 'Eau', 'PetitGibier']: W[n] = 1
    W['Pierre'] = 2
    c['loot'] = {
        ('ruines', 0): (3, 5, [('Ferraille', .40), ('Tissu', .35), ('Medic', .08)]),
        ('ruines', 1): (3, 6, [('Ferraille', .35), ('Pieces', .30), ('Munitions', .10), ('ArmeSimple', .07), ('Ingredient', .04), ('ArmeFeuCassee', .04)]),
        ('ruines', 2): (4, 7, [('Pieces', .30), ('Ferraille', .20), ('Munitions', .15), ('ArmeAvancee', .10), ('Ingredient', .08), ('ArmeFeuCassee', .07)]),
        ('foret', 0): (3, 5, [('Bois', .55), ('Baies', .25), ('PetitGibier', .15)]),
        ('foret', 1): (3, 6, [('Bois', .45), ('Gibier', .25), ('Baies', .15), ('Plante', .08), ('Ingredient', .04)]),
        ('foret', 2): (4, 7, [('Bois', .25), ('GrosGibier', .20), ('Plante', .15), ('BoisRare', .15), ('Ingredient', .08)]),
        ('marais', 0): (3, 5, [('Eau', .55), ('Tissu', .25), ('Plante', .12)]),
        ('marais', 1): (3, 6, [('Eau', .35), ('Plante', .20), ('Tissu', .20), ('PiecesRouillees', .10), ('Ingredient', .04), ('Radio', .03)]),
        ('marais', 2): (4, 7, [('Plante', .25), ('Eau', .20), ('Ingredient', .15), ('ObjetRare', .12), ('Radio', .08)]),
        ('montagne', 0): (3, 4, [('Pierre', .55), ('Ferraille', .20), ('GibierRare', .08)]),
        ('montagne', 1): (3, 6, [('Pierre', .35), ('Ferraille', .30), ('Gibier', .10), ('Munitions', .10), ('Ingredient', .04)]),
        ('montagne', 2): (4, 7, [('Pierre', .25), ('MineraiRare', .20), ('ArmeAvancee', .12), ('PiecesVoiture', .12), ('Ingredient', .08)]),
    }
    c['nat_max'] = [300, 400, 500]; c['nat_regen'] = .4; c['fini'] = [1500, 1200, 900]
    c['faim'] = 12; c['soif'] = 15
    c['ch'] = {
        'palissade': palissade([20, 30, 45, 60, 80, 100, 125, 150], [5, 8, 12, 16, 22, 28, 35, 42]),
        'place': [({'Bois': 25, 'Tissu': 15}, 8), ({'Bois': 50, 'Tissu': 30}, 16)],
        'puits': [({'Pierre': 20, 'Ferraille': 8}, 6), ({'Pierre': 40, 'Ferraille': 15}, 11)],
        'atelier': [({'Bois': 15, 'Ferraille': 25, 'Pieces': 8}, 10), ({'Bois': 25, 'Ferraille': 40, 'Pieces': 15}, 16)],
    }
    c['maison'] = [({'Bois': 10, 'Tissu': 5}, 3), ({'Bois': 25, 'Tissu': 12}, 7)]
    for k, v in kw.items():
        c[k] = v
    return c


def bilan(c, villes=((15, 'bonne'),), runs=20, cycles=35, titre=''):
    out, res = sim.stats(c, list(villes), runs=runs, max_cycles=cycles)
    sim.afficher(titre, out)
    return out, res


def compta(c, n=15, q='bonne', cycles=10, seed=3):
    s = sim.Sim(copy.deepcopy(c), [(n, q)], seed).run(cycles)
    d = {}
    for (k, ph), x in s.compta.items(): d.setdefault(k, [0, 0])[ph] += x
    print('  PA', {k: v for k, v in sorted(d.items())})
    v = s.villes[0]
    print('  constructions', v.log)
    print('  attaques', v.hist[:12])
    return s


def appliquer_inst(c):
    for b, pal in c['ch'].items():
        c['ch'][b] = [(res, max(1, round(sum(res.values()) * c['inst']))) for res, _ in pal]
    c['maison'] = [(res, max(1, round(sum(res.values()) * c['inst']))) for res, _ in c['maison']]
    return c


def cfg_v2(**kw):
    c = cfg_v1()
    c['trajet'] = [1, 2, 3]; c['vierge'] = 1
    c['inst'] = .5
    for k, v in kw.items(): c[k] = v
    return appliquer_inst(c)


def cfg_v3(**kw):
    c = cfg_v2()
    c['regen_pv_maison'] = 1
    c['loot'][('foret', 0)] = (3, 5, [('Bois', .50), ('Baies', .25), ('PetitGibier', .20)])
    c['loot'][('ruines', 0)] = (3, 5, [('Ferraille', .40), ('Tissu', .30), ('Medic', .08), ('Pieces', .07)])
    for k, v in kw.items(): c[k] = v
    return appliquer_inst(c)


def cfg_v4(**kw):
    c = cfg_v3()
    c['ratio_max'] = 1.0
    for k, v in kw.items(): c[k] = v
    return appliquer_inst(c)


def cfg_v5(**kw):
    c = cfg_v4(att_base=10, att_croiss=.13, fuite=[.8, .6])
    for k, v in kw.items(): c[k] = v
    return appliquer_inst(c)


def cfg_v6(**kw):
    """v5 sans les changements sans effet : poids actuels, pas de regen PV maison, degats de nuit plafonnes a 5"""
    c = cfg_v5(regen_pv_maison=0, ratio_max=.5)
    c['w'] = copy.deepcopy(sim.cfg_premier_jet()['w'])
    for k, v in kw.items(): c[k] = v
    return appliquer_inst(c)


def cfg_finale(**kw):
    c = cfg_v6()
    c['loot'][('montagne', 0)] = (3, 4, [('Pierre', .55), ('Ferraille', .20), ('GibierRare', .10)])
    c['nat_max'] = [400, 500, 600]; c['nat_regen'] = .5
    for k, v in kw.items(): c[k] = v
    return appliquer_inst(c)
