# Simulateur d'equilibrage Disc'Hordes (agents, zones partagees, combats, nuit, horde, faim/soif)
import random, math, copy, statistics, sys

TYPES = ['ruines', 'foret', 'marais', 'montagne']
NATURELS = {'Baies', 'Gibier', 'PetitGibier', 'GrosGibier', 'GibierRare'}


def cfg_premier_jet():
    c = {}
    c['pa_cible'] = 180; c['pa_cap'] = 40
    c['bag'] = 12; c['bank'] = [40, 80, 160]
    W = {}
    for n in ['Tissu', 'Baies', 'Plante', 'Ingredient', 'Munitions', 'Pieces', 'PiecesRouillees', 'MineraiRare', 'Medic',
              'Bandage', 'Ration', 'Remede', 'Conserve']: W[n] = 1
    for n in ['Bois', 'Ferraille', 'Eau', 'Gibier', 'PetitGibier', 'BoisRare', 'ObjetRare', 'ArmeSimple', 'ArmeFeuCassee',
              'Plat', 'Ragout', 'Feu', 'Festin']: W[n] = 2
    for n in ['Pierre', 'GrosGibier', 'GibierRare', 'ArmeAvancee', 'PiecesVoiture', 'Structure']: W[n] = 3
    W['Radio'] = 0
    c['w'] = W
    c['loot'] = {
        ('ruines', 0): (2, 3, [('Tissu', .5), ('Ferraille', .3), ('Medic', .1)]),
        ('ruines', 1): (2, 4, [('Ferraille', .3), ('Pieces', .3), ('Munitions', .15), ('ArmeSimple', .1), ('Ingredient', .05), ('ArmeFeuCassee', .05)]),
        ('ruines', 2): (3, 5, [('Pieces', .25), ('Munitions', .2), ('ArmeAvancee', .15), ('Ingredient', .1), ('ArmeFeuCassee', .1)]),
        ('foret', 0): (2, 3, [('Bois', .55), ('Baies', .25), ('PetitGibier', .15)]),
        ('foret', 1): (2, 4, [('Bois', .35), ('Gibier', .3), ('Baies', .15), ('Plante', .1), ('Ingredient', .05)]),
        ('foret', 2): (3, 5, [('GrosGibier', .25), ('Plante', .2), ('BoisRare', .15), ('Ingredient', .1)]),
        ('marais', 0): (2, 3, [('Eau', .45), ('Tissu', .25), ('Plante', .15)]),
        ('marais', 1): (2, 4, [('Eau', .3), ('Plante', .25), ('Tissu', .2), ('PiecesRouillees', .1), ('Ingredient', .05), ('Radio', .05)]),
        ('marais', 2): (3, 5, [('Plante', .25), ('Ingredient', .2), ('ObjetRare', .15), ('Radio', .1)]),
        ('montagne', 0): (2, 2, [('Pierre', .45), ('GibierRare', .2)]),
        ('montagne', 1): (2, 4, [('Pierre', .3), ('Ferraille', .25), ('Munitions', .15), ('Ingredient', .05)]),
        ('montagne', 2): (3, 5, [('MineraiRare', .25), ('ArmeAvancee', .2), ('PiecesVoiture', .15), ('Ingredient', .1)]),
    }
    c['enc'] = [.15, .30, .45]; c['enc_nuit'] = 1.5; c['enc_inc'] = .10
    c['fuite'] = [.75, .5]; c['cout_fuite'] = 1
    c['trajet'] = [2, 3, 4]; c['fouille'] = 2; c['vierge'] = 2
    c['nat_max'] = [100, 150, 200]; c['nat_regen'] = .4; c['fini'] = [800, 600, 400]
    c['stock_par_ville'] = False  # stocks multiplies par le nombre de villes du groupe
    c['faim'] = 16; c['soif'] = 20
    c['bouffe'] = {'Baies': (5, 0), 'PetitGibier': (7, 0), 'Gibier': (10, 0), 'GrosGibier': (25, 0), 'Eau': (0, 10),
                   'Plat': (20, 0), 'Ration': (0, 30), 'Conserve': (25, 0)}
    c['risque_eau'] = .2
    c['festin'] = 20  # faim par citoyen present
    c['ch'] = {
        'palissade': [({'Bois': 40, 'Ferraille': 10}, 10), ({'Bois': 60, 'Ferraille': 15}, 15), ({'Bois': 90, 'Ferraille': 25}, 23),
                      ({'Bois': 130, 'Ferraille': 35}, 33), ({'Bois': 180, 'Ferraille': 50}, 46), ({'Bois': 240, 'Ferraille': 70}, 62),
                      ({'Bois': 310, 'Ferraille': 90}, 80), ({'Bois': 400, 'Ferraille': 120}, 104)],
        'place': [({'Bois': 50, 'Tissu': 30}, 16), ({'Bois': 90, 'Tissu': 60}, 30)],
        'puits': [({'Pierre': 50, 'Ferraille': 20}, 14), ({'Pierre': 90, 'Ferraille': 40}, 26)],
        'atelier': [({'Bois': 30, 'Ferraille': 60, 'Pieces': 15}, 21), ({'Bois': 40, 'Ferraille': 100, 'Pieces': 30}, 34)],
    }
    c['maison'] = [({'Bois': 30, 'Tissu': 15}, 9), ({'Bois': 50, 'Tissu': 30}, 16)]
    c['maison_pa'] = .15; c['maison_repousse'] = .25
    c['ratio_max'] = .5
    c['inst'] = .2  # PA d'installation par ressource deposee
    c['def_base'] = 5; c['palis_bonus'] = [0, 5, 10, 16, 22, 29, 36, 44, 52]
    c['garde_cout'] = 6; c['garde'] = 3; c['garde_metier'] = 6
    c['struct'] = 3; c['struct_max'] = 5; c['struct_recette'] = ({'Ferraille': 3, 'Bois': 3, 'Pierre': 2}, 8)
    c['att_base'] = 15; c['att_croiss'] = .10; c['att_quad'] = 0.0
    c['horde'] = [3, 4, 5]
    c['puits'] = [1, 1.25]
    c['infection'] = .1
    c['regen_pv_maison'] = 0  # PV rendus a l'aube a qui a dormi en ville (piste)
    return c


QUAL = {
    'excellente': dict(act=.95, marge=3, bruit=.05, garde_marge=1.15, mange=55, nuit=True, malin=True),
    'bonne': dict(act=.88, marge=2, bruit=.15, garde_marge=1.05, mange=50, nuit=True, malin=True),
    'moyenne': dict(act=.75, marge=1, bruit=.35, garde_marge=.95, mange=40, nuit=False, malin=False),
    'faible': dict(act=.62, marge=0, bruit=.6, garde_marge=.8, mange=30, nuit=False, malin=False),
}

METIERS = ['garde', 'ingenieur', 'medecin', 'cuisinier', 'garde', 'eclaireur', 'artisan', 'chasseur', 'medecin',
           'ingenieur', 'cuisinier', 'eclaireur', 'artisan', None, None]


class Zone:
    def __init__(s, t, tier, c, nv):
        s.t, s.tier = t, tier
        k = nv if c['stock_par_ville'] else 1
        s.nat_max = c['nat_max'][tier] * k
        s.nat = s.nat_max
        s.fini = c['fini'][tier] * k
        s.feu = False


class Joueur:
    _id = 0

    def __init__(s, pa, metier, ville):
        Joueur._id += 1
        s.id = Joueur._id
        s.pa_base = pa; s.pa = pa; s.metier = metier; s.ville = ville
        s.pv = 10; s.faim = 100; s.soif = 100; s.vf = 0; s.vs = 0
        s.infecte = None; s.vivant = True; s.dehors = None  # (type, tier) ou None
        s.sac = {}; s.vues = set(); s.maison = 0; s.maison_dep = {}; s.maison_pa = 0
        s.zombie = False; s.consec = 0; s.cause = None; s.garde = False; s.coince = False

    def charge(s, c):
        return sum(c['w'].get(k, 1) * v for k, v in s.sac.items())

    def pa_max(s, c, phase):
        m = -0.05 * (10 - s.pv)
        for g, v in ((s.faim, s.vf), (s.soif, s.vs)):
            man = (100 - max(0, g)) / 100
            m -= .3 * man * man + (v * .15 if g <= 0 else 0)
        if s.infecte is not None:
            m -= .30 * min(1, (phase - s.infecte) / 4)
        if s.maison >= 2: m += c['maison_pa']
        return max(0, math.floor(s.pa_base * (1 + m) + 1e-9))


class Ville:
    def __init__(s, n, q, c, rng):
        s.q = QUAL[q]; s.qn = q
        s.pa = min(c['pa_cap'], c['pa_cible'] // n)
        mets = METIERS[:n]
        s.joueurs = [Joueur(s.pa, m, s) for m in mets]
        s.banque = {}; s.bat = {k: 0 for k in c['ch']}; s.dep = {k: {} for k in c['ch']}; s.pa_inst = {k: 0 for k in c['ch']}
        s.structs = 0; s.tombee = None; s.log = []; s.hist = []
        s.morts = []

    def vivants(s):
        return [j for j in s.joueurs if j.vivant]

    def cap_banque(s, c):
        return c['bank'][s.bat['place']]

    def charge_banque(s, c):
        return sum(c['w'].get(k, 1) * v for k, v in s.banque.items())


def ajouter(d, k, n=1):
    d[k] = d.get(k, 0) + n
    if d[k] <= 0: del d[k]


def force(c, cycle):
    return c['att_base'] * (1 + c['att_croiss']) ** (cycle - 1) + c['att_quad'] * (cycle - 1) ** 2


def cout(c, base, nuit):
    return math.ceil(base * 1.5) if nuit else base


class Sim:
    def __init__(s, c, villes, seed):
        s.c = c; s.rng = random.Random(seed)
        nv = len(villes)
        s.zones = {(t, k): Zone(t, k, c, nv) for t in TYPES for k in range(3)}
        s.villes = [Ville(n, q, c, s.rng) for n, q in villes]
        s.phase = 0
        s.compta = {}

    # ---------- valeurs ----------
    def cibles(s, v):
        c = s.c; q = v.q
        cyc = s.phase // 2 + 1
        passif = c['def_base'] + c['palis_bonus'][v.bat['palissade']] + v.structs * c['struct']
        ordre = [('palissade', 1), ('puits', 1), ('palissade', 2), ('atelier', 1), ('place', 1), ('palissade', 3),
                 ('maison', 1), ('palissade', 4), ('puits', 2), ('palissade', 5), ('atelier', 2), ('maison', 2),
                 ('place', 2), ('palissade', 6), ('palissade', 7), ('palissade', 8)]
        res = []
        nb_gardes_possibles = len(v.vivants()) * 0.5 * c['garde']
        if v.bat['palissade'] < 8 and passif + nb_gardes_possibles < force(c, cyc + 2) * q['garde_marge']:
            res.append('palissade')
        for b, t in ordre:
            if b == 'maison':
                if min((j.maison for j in v.vivants()), default=9) < t: res.append('maison')
            elif v.bat[b] < t:
                res.append(b)
            if len(res) >= 2: break
        if s.rng.random() < q['bruit']:
            res = [s.rng.choice(['palissade', 'puits', 'place', 'atelier', 'maison'])] + res
        if v.bat['atelier'] >= 1 and v.structs < c['struct_max']:
            res.append('structure')
        out = []
        for r in res:
            if r not in out and r != 'structure': out.append(r)
        out = out[:2]
        if 'structure' in res: out.append('structure')
        return out

    def besoins(s, v):
        c = s.c
        need = {}
        for b in s.cibles(v):
            if b == 'maison':
                t = min(j.maison for j in v.vivants())
                if t < len(c['maison']):
                    for r, n in c['maison'][t][0].items(): need[r] = need.get(r, 0) + n * 3
            elif b == 'structure':
                for r, n in c['struct_recette'][0].items(): need[r] = need.get(r, 0) + n * 2
            else:
                t = v.bat[b]
                if t < len(c['ch'][b]):
                    for r, n in c['ch'][b][t][0].items(): need[r] = need.get(r, 0) + max(0, n - v.dep[b].get(r, 0))
        for r in list(need): need[r] -= v.banque.get(r, 0)
        return need

    def valeurs(s, v):
        c = s.c
        need = s.besoins(v)
        val = {}
        tot = sum(max(0, n) for n in need.values()) or 1
        for r, n in need.items():
            val[r] = (0.8 + 0.8 * max(0, n) / tot) if n > 0 else 0.15
        nviv = len(v.vivants())
        faim_stock = sum(c['bouffe'].get(k, (0, 0))[0] * n for k, n in v.banque.items())
        soif_stock = sum(c['bouffe'].get(k, (0, 0))[1] * n for k, n in v.banque.items())
        prod_puits = nviv * c['puits'][v.bat['puits'] - 1] * 30 if v.bat['puits'] else 0
        viv = v.vivants()
        # quantite a apporter pour garder tout le monde au-dessus de 45 pendant 2 cycles
        bf = sum(max(0, c['faim'] * 4 - (j.faim - 45)) for j in viv) + 1
        bs = sum(max(0, c['soif'] * 4 - (j.soif - 45)) for j in viv) + 1
        rf = max(0, bf - faim_stock) / (nviv * c['faim'] * 4 + 1)
        rs = max(0, bs - soif_stock - prod_puits * 2) / (nviv * c['soif'] * 4 + 1)
        kf = 0.2 + 3.0 * rf
        ks = 0.2 + 3.0 * rs
        for k, (f, so) in c['bouffe'].items():
            if f: val[k] = max(val.get(k, 0), kf * f / 10)
            if so: val[k] = max(val.get(k, 0), ks * so / 10 * (0.8 if k == 'Eau' else 1))
        val['Tissu'] = max(val.get('Tissu', 0), 0.6 if v.banque.get('Tissu', 0) < 8 else 0.2)
        val['Medic'] = 1.5 if v.banque.get('Medic', 0) < 5 else 0.3
        val['Bandage'] = 1.2; val['Ration'] = max(val.get('Ration', 0), 1.0); val['Plat'] = max(val.get('Plat', 0), 1.0)
        atelier = v.bat['atelier'] >= 1
        val['Plante'] = max(val.get('Plante', 0), 0.5 if atelier else 0.2); val['Ingredient'] = 1.2 if atelier else 0.5
        val['BoisRare'] = val.get('Bois', 0.15) * 5
        if v.bat['atelier'] >= 1: val['GibierRare'] = 3.0
        val['PiecesRouillees'] = val.get('Pieces', 0.1) * 0.4
        # stocks suffisants : on arrete d'en ramener
        for k, cible in (('Ingredient', 3), ('Plante', 6), ('Medic', 5), ('GibierRare', 3), ('Bandage', 4), ('Tissu', 10)):
            if v.banque.get(k, 0) >= cible: val[k] = min(val.get(k, 0), 0.1)
        return val

    # ---------- actions ----------
    def manger(s, j, v, seuil):
        c = s.c
        sources = [j.sac] + ([v.banque] if j.dehors is None else [])
        for jauge, idx in (('faim', 0), ('soif', 1)):
            for _ in range(10):
                g = getattr(j, jauge)
                if g > seuil: break
                best = None
                for src in sources:
                    for k, n in src.items():
                        e = c['bouffe'].get(k)
                        if e and e[idx] > 0:
                            # eviter l'eau brute si on a mieux
                            score = e[idx] - (100 if k == 'Eau' else 0) - max(0, g + e[idx] - 100)
                            if best is None or score > best[0]: best = (score, src, k, e[idx])
                if not best: break
                _, src, k, val = best
                ajouter(src, k, -1)
                setattr(j, jauge, min(100, g + val))
                if jauge == 'faim': j.vf = 0
                else: j.vs = 0
                if k == 'Eau' and s.rng.random() < c['risque_eau']:
                    s.blesser(j, 1, 'eau croupie', infect=False)
                    if not j.vivant: return

    def blesser(s, j, n, cause, infect=True):
        if not j.vivant: return
        j.pv -= n
        if infect and j.infecte is None and s.rng.random() < s.c['infection']:
            j.infecte = s.phase
        if j.pv <= 0:
            j.vivant = False; j.cause = cause
            j.ville.morts.append((s.phase // 2 + 1, cause))

    def rencontre(s, j, nuit):
        """fuite systematique ; renvoie False si coince (plus de PA)"""
        c = s.c
        while True:
            cf = cout(c, c['cout_fuite'], nuit)
            if j.pa < cf:
                j.zombie = True
                return False
            j.pa -= cf; s.compta[('fuite', s.phase % 2)] = s.compta.get(('fuite', s.phase % 2), 0) + (cf)
            if s.rng.random() < c['fuite'][1 if nuit else 0]:
                j.consec = 0
                return True
            s.blesser(j, 1, 'tue dehors', infect=False)
            if not j.vivant: return False

    def secours(s, j, v, nuit):
        """Feu + sieste pour regagner de quoi rentrer (joueurs malins qui portent un Feu)"""
        c = s.c
        if j.dehors is None or not v.q['malin'] or getattr(j, 'sieste', -1) == s.phase: return
        z = s.zones[j.dehors]
        if not z.feu:
            if not j.sac.get('Feu') or j.pa < cout(c, 1, nuit): return
            j.pa -= cout(c, 1, nuit); ajouter(j.sac, 'Feu', -1); z.feu = True
            s.compta[('feu', s.phase % 2)] = s.compta.get(('feu', s.phase % 2), 0) + 1
        j.sieste = s.phase
        if s.rng.random() < c['enc'][z.tier] * (c['enc_nuit'] if nuit else 1) * .5:
            j.zombie = True
            if not s.rencontre(j, nuit): return
            j.zombie = False
        pm = j.pa_max(c, s.phase)
        j.pa = min(pm, j.pa + math.floor(pm * 0.25))

    def chance_renc(s, j, z, nuit):
        c = s.c
        p = c['enc'][z.tier] * (c['enc_nuit'] if nuit else 1) + c['enc_inc'] * j.consec
        if z.feu: p *= .5
        return min(1, p)

    def retour_cout(s, tier, nuit):
        c = s.c
        tot = cout(c, c['trajet'][0], nuit)
        for k in range(tier, 0, -1): tot += cout(c, c['trajet'][k - 1], nuit)
        return tot

    def aller_cout(s, j, typ, tier, nuit):
        c = s.c
        tot = 0
        for k in range(tier + 1):
            tot += cout(c, c['trajet'][k], nuit)
            if (typ, k) not in j.vues and j.metier != 'eclaireur': tot += c['vierge']
        return tot

    def valeur_fouille(s, z, val):
        mn, mx, tab = s.c['loot'][(z.t, z.tier)]
        nb = (mn + mx) / 2
        e = 0
        for o, p in tab:
            dispo = (z.nat if (o in NATURELS or (o == 'Bois' and z.t == 'foret')) else z.fini)
            f = min(1, dispo / 20)
            e += p * val.get(o, 0.05) * f
        return nb * e

    def marge(s, v, nuit):
        m = v.q['marge']
        if nuit and v.q['malin']: m += 2 * cout(s.c, s.c['cout_fuite'], True)
        return m

    def choisir_zone(s, j, v, val, nuit):
        c = s.c
        best = None
        for (t, k), z in s.zones.items():
            if k == 2 and not v.q['malin']: continue
            if nuit and k > 0: continue
            aller = s.aller_cout(j, t, k, nuit); ret = s.retour_cout(k, nuit)
            dispo = j.pa - aller - ret - s.marge(v, nuit)
            nf = dispo // cout(c, c['fouille'], nuit)
            if nf < 1: continue
            # limiter par le sac (approx poids moyen 2)
            place = c['bag'] - j.charge(c)
            nb_moy = (c['loot'][(t, k)][0] + c['loot'][(t, k)][1]) / 2
            nf = min(nf, max(1, place / (nb_moy * 0.75 * 1.8)) + 0.5)
            nf = max(1, int(nf))
            g = s.valeur_fouille(z, val) * nf
            risque = (c['enc'][k] * (1.5 if nuit else 1)) * nf * 0.35
            sc = g / (aller + ret + nf * cout(c, c['fouille'], nuit)) - risque * 0.05
            sc *= 1 + s.rng.gauss(0, v.q['bruit'])
            if best is None or sc > best[0]: best = (sc, t, k)
        return best

    def expedition(s, j, v, nuit):
        c = s.c
        if c['bag'] - j.charge(c) < 4: return False
        val = s.valeurs(v)
        ch = s.choisir_zone(j, v, val, nuit)
        if not ch or ch[0] <= 0.02: return False
        _, t, k = ch
        # aller
        tier = -1
        j.consec = 0
        while tier < k:
            nxt = tier + 1
            co = cout(c, c['trajet'][nxt], nuit) + (c['vierge'] if (t, nxt) not in j.vues and j.metier != 'eclaireur' else 0)
            if j.pa < co + s.retour_cout(nxt, nuit) + s.marge(v, nuit): break
            j.pa -= co; s.compta[('trajet', s.phase % 2)] = s.compta.get(('trajet', s.phase % 2), 0) + (co); tier = nxt; j.dehors = (t, tier); j.vues.add((t, tier))
            z = s.zones[(t, tier)]
            if s.rng.random() < s.chance_renc(j, z, nuit):
                if not s.rencontre(j, nuit): return True
                # rebrousse chemin
                tier -= 1
                j.dehors = (t, tier) if tier >= 0 else None
                if tier < 0: return True
                break
        if tier < 0: j.dehors = None; return True
        z = s.zones[(t, tier)]
        # fouilles
        cf = cout(c, c['fouille'], nuit)
        while j.pa >= cf + s.retour_cout(tier, nuit) + s.marge(v, nuit) + (j.consec // 3 if v.q['malin'] else 0) and c['bag'] - j.charge(c) >= 1:
            j.pa -= cf; s.compta[('fouille', s.phase % 2)] = s.compta.get(('fouille', s.phase % 2), 0) + (cf)
            mn, mx, tab = c['loot'][(t, tier)]
            nb = s.rng.randint(mn, mx)
            for _ in range(nb):
                r = s.rng.random(); obj = None
                for o, p in tab:
                    r -= p
                    if r < 0: obj = o; break
                if not obj: continue
                nat = obj in NATURELS or (obj == 'Bois' and t == 'foret')
                if nat:
                    if z.nat < 1: continue
                    z.nat -= 1
                else:
                    if z.fini < 1: continue
                    z.fini -= 1
                w = c['w'].get(obj, 1)
                if c['bag'] - j.charge(c) >= w:
                    ajouter(j.sac, obj)
                elif v.q['malin']:
                    # jeter un objet moins utile
                    pire = min(j.sac, key=lambda o: val.get(o, 0.05) / max(1, c['w'].get(o, 1)), default=None)
                    if pire and val.get(pire, .05) / max(1, c['w'].get(pire, 1)) < val.get(obj, .05) / max(1, w) * 0.8:
                        while c['bag'] - j.charge(c) < w and j.sac.get(pire):
                            ajouter(j.sac, pire, -1)
                        if c['bag'] - j.charge(c) >= w: ajouter(j.sac, obj)
            if s.rng.random() < s.chance_renc(j, z, nuit):
                if not s.rencontre(j, nuit): return True
            else:
                j.consec += 1
        # manger dehors si besoin
        s.manger(j, v, v.q['mange'] - 10)
        # retour
        while tier >= 0:
            co = cout(c, c['trajet'][tier - 1], nuit) if tier > 0 else cout(c, c['trajet'][0], nuit)
            if j.pa < co: s.secours(j, v, nuit)
            if j.pa < co: j.coince = True; return True
            j.pa -= co; s.compta[('trajet', s.phase % 2)] = s.compta.get(('trajet', s.phase % 2), 0) + (co)
            tier -= 1
            if tier >= 0:
                j.dehors = (t, tier)
                z = s.zones[(t, tier)]
                if s.rng.random() < s.chance_renc(j, z, nuit):
                    if not s.rencontre(j, nuit): return True
        j.dehors = None; j.consec = 0
        s.deposer(j, v)
        return True

    def deposer(s, j, v):
        c = s.c
        if v.q['malin'] and not j.sac.get('Feu') and j.sac.get('Bois', 0) >= 2 and j.pa >= 1:
            ajouter(j.sac, 'Bois', -2); ajouter(j.sac, 'Feu'); j.pa -= 1
        # chantiers d'abord (en gardant en banque de quoi faire une structure si l'ingenieur peut la fabriquer)
        cib = s.cibles(v)
        reserve = {}
        if 'structure' in cib and any(x.metier == 'ingenieur' for x in v.vivants()):
            reserve = dict(c['struct_recette'][0])
        def dispo_src(src, r):
            return src.get(r, 0) - (reserve.get(r, 0) if src is v.banque else 0)
        for b in cib:
            if b in ('structure',): continue
            if b == 'maison':
                if j.maison >= len(c['maison']): continue
                besoin = c['maison'][j.maison][0]
                for r, n in besoin.items():
                    m = n - j.maison_dep.get(r, 0)
                    for src in (j.sac, v.banque):
                        pris = min(m, src.get(r, 0) + (src.get('BoisRare', 0) * 5 if r == 'Bois' else 0))
                        q = max(0, min(m, dispo_src(src, r)))
                        ajouter(src, r, -q); ajouter(j.maison_dep, r, q); m -= q
                        if r == 'Bois' and m > 0 and src.get('BoisRare'):
                            nb = min(src['BoisRare'], math.ceil(m / 5)); ajouter(src, 'BoisRare', -nb)
                            ajouter(j.maison_dep, r, min(m, nb * 5)); m -= min(m, nb * 5)
                continue
            t = v.bat[b]
            if t >= len(c['ch'][b]): continue
            besoin = c['ch'][b][t][0]
            for r, n in besoin.items():
                m = n - v.dep[b].get(r, 0)
                for src in (j.sac, v.banque):
                    q = max(0, min(m, dispo_src(src, r)))
                    if q > 0: ajouter(src, r, -q); ajouter(v.dep[b], r, q); m -= q
                    if r == 'Bois' and m > 0 and src.get('BoisRare'):
                        nb = min(src['BoisRare'], math.ceil(m / 5)); ajouter(src, 'BoisRare', -nb)
                        ajouter(v.dep[b], r, min(m, nb * 5)); m -= min(m, nb * 5)
        # reste en banque : seulement ce qui sert (les moins malins deposent tout)
        val = s.valeurs(v)
        for k in sorted(j.sac, key=lambda o: -val.get(o, 0)):
            if v.q['malin'] and val.get(k, 0) < 0.3: continue
            if v.q['malin']:
                # banque pleine : on jette ce qui y vaut moins
                while j.sac.get(k) and v.cap_banque(c) - v.charge_banque(c) < c['w'].get(k, 1):
                    pire = min(v.banque, key=lambda o: val.get(o, 0) / max(1, c['w'].get(o, 1)), default=None)
                    if pire is None or val.get(pire, 0) / max(1, c['w'].get(pire, 1)) >= val.get(k, 0) / max(1, c['w'].get(k, 1)) * 0.8: break
                    ajouter(v.banque, pire, -1)
            while j.sac.get(k) and v.cap_banque(c) - v.charge_banque(c) >= c['w'].get(k, 1):
                ajouter(j.sac, k, -1); ajouter(v.banque, k)
        # ce qui ne rentre pas : jete si sans valeur (malin) sinon garde
        if v.q['malin']:
            for k in list(j.sac):
                if val.get(k, 0) < 0.3: j.sac.pop(k)

    def installer(s, j, v):
        c = s.c
        for b in s.cibles(v):
            if b == 'structure' or b == 'maison': continue
            t = v.bat[b]
            if t >= len(c['ch'][b]): continue
            besoin, pa = c['ch'][b][t]
            dep = sum(min(n, v.dep[b].get(r, 0)) for r, n in besoin.items())
            autorise = min(pa, (dep // 10) * round(10 * c['inst'])) if dep < sum(besoin.values()) else pa
            x = min(j.pa, autorise - v.pa_inst[b])
            if x > 0: j.pa -= x; s.compta[('install', s.phase % 2)] = s.compta.get(('install', s.phase % 2), 0) + (x); v.pa_inst[b] += x
            if v.pa_inst[b] >= pa and all(v.dep[b].get(r, 0) >= n for r, n in besoin.items()):
                v.bat[b] += 1; v.dep[b] = {}; v.pa_inst[b] = 0
                v.log.append((s.phase // 2 + 1, b, v.bat[b]))
        # maison perso
        if j.maison < len(c['maison']):
            besoin, pa = c['maison'][j.maison]
            dep = sum(min(n, j.maison_dep.get(r, 0)) for r, n in besoin.items())
            autorise = min(pa, (dep // 10) * round(10 * c['inst'])) if dep < sum(besoin.values()) else pa
            x = min(j.pa, autorise - j.maison_pa)
            if x > 0: j.pa -= x; s.compta[('install', s.phase % 2)] = s.compta.get(('install', s.phase % 2), 0) + (x); j.maison_pa += x
            if j.maison_pa >= pa and all(j.maison_dep.get(r, 0) >= n for r, n in besoin.items()):
                j.maison += 1; j.maison_dep = {}; j.maison_pa = 0

    def crafter(s, j, v, nuit):
        c = s.c; B = v.banque; S = j.sac
        def n(r): return B.get(r, 0) + S.get(r, 0)
        def prendre(r, q=1):
            x = min(q, S.get(r, 0)); ajouter(S, r, -x); q -= x
            if q: ajouter(B, r, -q)
        def produire(r):
            if v.cap_banque(c) - v.charge_banque(c) >= c['w'].get(r, 1): ajouter(B, r)
            else: ajouter(S, r)
        # soins
        blesses = [x for x in v.vivants() if x.dehors is None and x.pv <= 7]
        for x in blesses:
            if j.metier == 'medecin' and n('Medic') and j.pa >= cout(c, 4, nuit):
                j.pa -= cout(c, 4, nuit); s.compta[('soin', s.phase % 2)] = s.compta.get(('soin', s.phase % 2), 0) + (cout(c, 4, nuit)); prendre('Medic'); x.pv = min(10, x.pv + 5); continue
            if not n('Bandage') and n('Tissu') >= 2 and j.pa >= 1:
                j.pa -= 1; s.compta[('craft', s.phase % 2)] = s.compta.get(('craft', s.phase % 2), 0) + (1); prendre('Tissu', 2); produire('Bandage')
            if n('Bandage') and j.pa >= cout(c, 2, nuit):
                j.pa -= cout(c, 2, nuit); s.compta[('soin', s.phase % 2)] = s.compta.get(('soin', s.phase % 2), 0) + (cout(c, 2, nuit)); prendre('Bandage'); x.pv = min(10, x.pv + 2)
        # rations
        while n('Eau') >= 2 and n('Tissu') >= 1 and j.pa >= 1:
            j.pa -= 1; s.compta[('craft', s.phase % 2)] = s.compta.get(('craft', s.phase % 2), 0) + (1); prendre('Eau', 2); prendre('Tissu'); produire('Ration')
        # plats
        while n('Baies') >= 1 and n('Gibier') >= 1 and j.pa >= 1:
            j.pa -= 1; s.compta[('craft', s.phase % 2)] = s.compta.get(('craft', s.phase % 2), 0) + (1); prendre('Baies'); prendre('Gibier'); produire('Plat')
        # festin (cuisinier, atelier)
        if j.metier == 'cuisinier' and v.bat['atelier'] >= 1:
            while n('GibierRare') and n('Baies') >= 2 and n('Ration') and j.pa >= 6:
                j.pa -= 6; s.compta[('craft', s.phase % 2)] = s.compta.get(('craft', s.phase % 2), 0) + (6)
                prendre('GibierRare'); prendre('Ration'); prendre('Baies', 2)
                for x in v.vivants():
                    if x.dehors is None: x.faim = min(100, x.faim + c['festin'])
        # structures (ingenieur)
        if j.metier == 'ingenieur' and v.bat['atelier'] >= 1:
            rec, pa = c['struct_recette']
            while v.structs < c['struct_max'] and j.pa >= pa and all(n(r) >= q for r, q in rec.items()):
                j.pa -= pa; s.compta[('craft', s.phase % 2)] = s.compta.get(('craft', s.phase % 2), 0) + (pa)
                for r, q in rec.items(): prendre(r, q)
                v.structs += 1
        # remede (medecin)
        if j.metier == 'medecin' and v.bat['atelier'] >= 1:
            for x in v.vivants():
                if x.infecte is not None and n('Plante') >= 2 and n('Ingredient') and n('Ration') and j.pa >= 6:
                    j.pa -= 6; s.compta[('craft', s.phase % 2)] = s.compta.get(('craft', s.phase % 2), 0) + (6); prendre('Plante', 2); prendre('Ingredient'); prendre('Ration')
                    x.infecte = None

    # ---------- phase ----------
    def jouer_phase(s):
        c = s.c
        nuit = s.phase % 2 == 1
        cyc = s.phase // 2 + 1
        tous = [j for v in s.villes if v.tombee is None for j in v.vivants()]
        s.rng.shuffle(tous)
        # gardes (debut de nuit)
        if nuit:
            for v in s.villes:
                if v.tombee: continue
                passif = c['def_base'] + c['palis_bonus'][v.bat['palissade']] + v.structs * c['struct']
                manque = force(c, cyc) * v.q['garde_marge'] - passif
                cands = sorted([j for j in v.vivants() if j.dehors is None and not j.coince],
                               key=lambda j: (j.metier != 'garde', -j.pa))
                for j in cands:
                    if manque <= 0: break
                    if s.rng.random() > v.q['act']: continue
                    if j.pa >= c['garde_cout']:
                        j.pa -= c['garde_cout']; s.compta[('garde', s.phase % 2)] = s.compta.get(('garde', s.phase % 2), 0) + (c['garde_cout']); j.garde = True
                        manque -= c['garde_metier'] if j.metier == 'garde' else c['garde']
        for j in tous:
            v = j.ville
            if not j.vivant: continue
            if s.rng.random() > v.q['act']: continue
            s.compta[('dispo', s.phase % 2)] = s.compta.get(('dispo', s.phase % 2), 0) + j.pa
            if j.dehors is not None:
                # coince dehors : tenter de rentrer
                s.manger(j, v, v.q['mange'])
                if j.pa < s.retour_cout(j.dehors[1], nuit): s.secours(j, v, nuit)
                if j.zombie:
                    if not s.rencontre(j, nuit): continue
                    j.zombie = False
                t, tier = j.dehors
                if j.pa >= s.retour_cout(tier, nuit):
                    j.pa -= s.retour_cout(tier, nuit); s.compta[('trajet', s.phase % 2)] = s.compta.get(('trajet', s.phase % 2), 0) + (s.retour_cout(tier, nuit)); j.dehors = None; j.coince = False; s.deposer(j, v)
                else:
                    continue
            s.manger(j, v, v.q['mange'])
            if not j.vivant: continue
            # banque presque pleine : on mange ce qui encombre, sans gaspiller
            if v.charge_banque(c) > 0.85 * v.cap_banque(c):
                s.manger(j, v, 100 - 10)
                if not j.vivant: continue
            s.crafter(j, v, nuit)
            if v.q['malin'] and not j.sac.get('Feu') and j.pa >= 3:
                tot = j.sac.get('Bois', 0) + v.banque.get('Bois', 0)
                if tot >= 2:
                    x = min(2, j.sac.get('Bois', 0)); ajouter(j.sac, 'Bois', -x); ajouter(v.banque, 'Bois', -(2 - x))
                    ajouter(j.sac, 'Feu'); j.pa -= 1
            s.installer(j, v)
            if j.garde:
                continue
            n = 0
            while j.vivant and j.dehors is None and n < 4 and (not nuit or v.q['nuit']):
                n += 1
                if not s.expedition(j, v, nuit): break
                if j.dehors is not None: break
                s.crafter(j, v, nuit)
                s.installer(j, v)
            if j.dehors is None and j.vivant:
                s.installer(j, v)

    def bascule(s):
        c = s.c
        nuit = s.phase % 2 == 1
        cyc = s.phase // 2 + 1
        for v in s.villes:
            if v.tombee: continue
            if nuit:
                # attaque de l'aube
                passif = c['def_base'] + c['palis_bonus'][v.bat['palissade']] + v.structs * c['struct']
                gardes = sum((c['garde_metier'] if j.metier == 'garde' else c['garde']) for j in v.vivants() if j.garde and j.dehors is None)
                df = passif + gardes; att = force(c, cyc)
                v.hist.append((cyc, round(att, 1), df, v.bat['palissade'], v.structs, len(v.vivants())))
                deficit = att - df
                presents = [j for j in v.vivants() if j.dehors is None]
                if deficit > 0 and presents:
                    ratio = deficit / att
                    nb = ratio * len(presents)
                    nbv = int(nb) + (1 if s.rng.random() < nb - int(nb) else 0)
                    vict = s.rng.sample(presents, min(nbv, len(presents)))
                    for j in vict:
                        if j.maison >= 2 and s.rng.random() < c['maison_repousse'] * (j.maison - 1): continue
                        s.blesser(j, math.ceil(min(c['ratio_max'], ratio) * 10), 'attaque')
                    # degats chantiers
                    bud = deficit
                    while bud > 0 and v.structs > 0: v.structs -= 1; bud -= 3
                    if bud > 0 and v.bat['palissade'] > 0:
                        bud -= c['palis_bonus'][v.bat['palissade']] - c['palis_bonus'][v.bat['palissade'] - 1]
                        v.bat['palissade'] -= 1
                    if bud > 0:
                        pts = min(10, math.ceil(bud))
                        for b in v.dep:
                            for r in list(v.dep[b]): v.dep[b][r] = int(v.dep[b][r] * (1 - pts / 10))
                            v.pa_inst[b] = int(v.pa_inst[b] * (1 - pts / 10))
                        bud -= pts
                    if bud >= 5:
                        cand = [b for b in v.bat if b != 'palissade' and v.bat[b] > 0]
                        if cand: v.bat[s.rng.choice(cand)] -= 1
                # horde
                for j in v.vivants():
                    if j.dehors is not None:
                        t, tier = j.dehors
                        s.blesser(j, c['horde'][tier], 'horde')
                        j.zombie = True
                for j in v.vivants(): j.garde = False
            else:
                for j in v.vivants():
                    if j.dehors is not None:
                        if j.zombie: s.blesser(j, 1, 'tue dehors')
                        else:
                            z = s.zones[j.dehors]
                            if s.rng.random() < c['enc'][z.tier] * 1.5: j.zombie = True
            # faim / soif
            for j in v.vivants():
                j.faim = max(0, j.faim - c['faim']); j.soif = max(0, j.soif - c['soif'])
                pert = 0
                for g, attr in ((j.faim, 'vf'), (j.soif, 'vs')):
                    if g <= 0: pert += 2; setattr(j, attr, getattr(j, attr) + 1)
                    elif g < 10: pert += 1
                if pert: s.blesser(j, pert, 'faim/soif', infect=False)
            # infection
            for j in v.vivants():
                if j.infecte is not None and s.phase + 1 - j.infecte >= 4:
                    j.vivant = False; j.cause = 'zombie'; v.morts.append((cyc, 'infection'))
            # puits + PV regen + regen PA
            if nuit:
                if v.bat['puits']:
                    n = math.ceil(len(v.vivants()) * c['puits'][v.bat['puits'] - 1])
                    for _ in range(n):
                        if v.cap_banque(c) - v.charge_banque(c) >= 1: ajouter(v.banque, 'Ration')
                if c['regen_pv_maison']:
                    for j in v.vivants():
                        if j.dehors is None and j.maison >= 1: j.pv = min(10, j.pv + c['regen_pv_maison'])
            for j in v.vivants():
                if j.dehors is None:
                    j.pa = j.pa_max(c, s.phase + 1)
            if not v.vivants():
                v.tombee = cyc
        if nuit:
            for z in s.zones.values():
                z.nat = min(z.nat_max, z.nat + z.nat_max * c['nat_regen'])
                z.feu = False
        s.phase += 1

    def run(s, max_cycles=35):
        while s.phase < max_cycles * 2:
            if all(v.tombee for v in s.villes): break
            s.jouer_phase()
            s.bascule()
        for v in s.villes:
            if not v.tombee: v.tombee = max_cycles + 1
        return s


def stats(c, villes, runs=40, max_cycles=35, seed0=1):
    res = []
    for r in range(runs):
        s = Sim(copy.deepcopy(c), villes, seed0 + r).run(max_cycles)
        res.append(s)
    out = []
    for i, (n, q) in enumerate(villes):
        chute = [s.villes[i].tombee for s in res]
        m10 = [sum(1 for cy, _ in s.villes[i].morts if cy <= 10) for s in res]
        m15 = [sum(1 for cy, _ in s.villes[i].morts if cy <= 15) for s in res]
        def palier_a(s, cy, b='palissade'):
            p = 0
            for (cc, bb, t) in s.villes[i].log:
                if bb == b and cc <= cy: p = t
            return p
        p10 = [palier_a(s, 10) for s in res]
        p15 = [palier_a(s, 15) for s in res]
        puits = [min([cc for (cc, bb, t) in s.villes[i].log if bb == 'puits'] or [99]) for s in res]
        atel = [min([cc for (cc, bb, t) in s.villes[i].log if bb == 'atelier'] or [99]) for s in res]
        def percee(s):
            for (cy, att, df, pal, st_, nv) in s.villes[i].hist:
                if cy > 3 and att - df > 0.15 * att: return cy
            return max_cycles + 1
        def moitie(s):
            morts = sorted(cy for cy, _ in s.villes[i].morts)
            return morts[(n + 1) // 2 - 1] if len(morts) >= (n + 1) // 2 else max_cycles + 1
        pc = [percee(s) for s in res]; mo = [moitie(s) for s in res]
        causes = {}
        for s in res:
            for cy, ca in s.villes[i].morts: causes[ca] = causes.get(ca, 0) + 1
        out.append(dict(percee=statistics.median(pc), moitie=statistics.median(mo), moitie_p10=sorted(mo)[len(mo) // 10], n=n, q=q, chute_med=statistics.median(chute), chute_p10=sorted(chute)[len(chute) // 10],
                        chute_p90=sorted(chute)[len(chute) * 9 // 10],
                        morts10=statistics.mean(m10), morts15=statistics.mean(m15),
                        palis10=statistics.mean(p10), palis15=statistics.mean(p15),
                        puits=statistics.median(puits), atelier=statistics.median(atel),
                        causes={k: round(v / runs, 1) for k, v in causes.items()}))
    return out, res


def afficher(titre, out):
    print('==', titre)
    for o in out:
        print(f"  {o['n']:2d} j {o['q']:10s} percee {o['percee']:>4} moitie {o['moitie']:>4} (p10 {o['moitie_p10']:>2}) chute med {o['chute_med']:>4} [p10 {o['chute_p10']:>2} p90 {o['chute_p90']:>2}]"
              f" morts<=10 {o['morts10']:.1f} <=15 {o['morts15']:.1f} palis@10 {o['palis10']:.1f} @15 {o['palis15']:.1f}"
              f" puits c{o['puits']} atel c{o['atelier']}")


if __name__ == '__main__':
    c = cfg_premier_jet()
    for q in ['excellente', 'bonne', 'moyenne', 'faible']:
        out, _ = stats(c, [(15, q)], runs=20)
        afficher('premier jet 15 ' + q, out)
