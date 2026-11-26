import math
import numpy as np
import ifcopenshell
import ifcopenshell.api


def export_ifc(project):
    model = ifcopenshell.file(schema='IFC4')
    run = lambda operation, **kwargs: ifcopenshell.api.run(operation, model, **kwargs)
    root = run('root.create_entity', ifc_class='IfcProject', name=project.get('name', 'Plantea 3D'))
    units = [run('unit.add_si_unit', unit_type=t) for t in ('LENGTHUNIT', 'AREAUNIT', 'VOLUMEUNIT')]
    run('unit.assign_unit', units=units)
    context = run('context.add_context', context_type='Model')
    body = run(
        'context.add_context',
        context_type='Model',
        context_identifier='Body',
        target_view='MODEL_VIEW',
        parent=context,
    )
    site = run('root.create_entity', ifc_class='IfcSite', name='Sitio')
    building = run('root.create_entity', ifc_class='IfcBuilding', name='Edificio')
    storey = run('root.create_entity', ifc_class='IfcBuildingStorey', name='Planta 01')
    storey.Elevation = 0.0
    for parent, child in ((root, site), (site, building), (building, storey)):
        run('aggregate.assign_object', products=[child], relating_object=parent)
    width = float(project['width'])
    depth = width * float(project['ratio'])
    for index, w in enumerate(project['walls']):
        x = w['a']['x'] * width
        y = (1 - w['a']['y']) * depth
        dx = (w['b']['x'] - w['a']['x']) * width
        dy = -(w['b']['y'] - w['a']['y']) * depth
        length = math.hypot(dx, dy)
        if length < 0.001:
            continue
        height = float(w.get('height') or project['height'])
        thickness = float(w.get('thickness') or project['thickness'])
        matrix = np.eye(4)
        matrix[:3, 0] = (dx / length, dy / length, 0)
        matrix[:3, 1] = (-dy / length, dx / length, 0)
        matrix[:3, 3] = (x, y, 0)
        wall = run('root.create_entity', ifc_class='IfcWall', name=f'Muro {index + 1}')
        run('spatial.assign_container', products=[wall], relating_structure=storey)
        rep = run(
            'geometry.add_wall_representation',
            context=body,
            length=length,
            height=height,
            thickness=thickness,
            offset=-thickness / 2,
        )
        run('geometry.assign_representation', product=wall, representation=rep)
        run('geometry.edit_object_placement', product=wall, matrix=matrix, is_si=True)
        pset = run('pset.add_pset', product=wall, name='Plantea3D_Origen')
        run(
            'pset.edit_pset',
            pset=pset,
            properties={
                'IdPlantea3D': str(w.get('id', index)),
                'PendienteRevision': bool(w.get('inferred', False)),
                'Uso': 'Modelo conceptual; sin verificacion estructural',
            },
        )
        if w['type'] not in ('door', 'window'):
            continue
        sill = float(w.get('sill', 0.9)) if w['type'] == 'window' else 0.0
        opening_height = min(
            float(w.get('openHeight') or (1.2 if w['type'] == 'window' else 2.1)), height - sill
        )
        if opening_height <= 0:
            continue
        opening = run(
            'root.create_entity', ifc_class='IfcOpeningElement', name=f'Abertura {index + 1}'
        )
        rep = run(
            'geometry.add_wall_representation',
            context=body,
            length=length,
            height=opening_height,
            thickness=thickness + 0.04,
            offset=-(thickness + 0.04) / 2,
        )
        run('geometry.assign_representation', product=opening, representation=rep)
        opening_matrix = matrix.copy()
        opening_matrix[2, 3] = sill
        run('geometry.edit_object_placement', product=opening, matrix=opening_matrix, is_si=True)
        run('feature.add_feature', feature=opening, element=wall)
        filling = run(
            'root.create_entity',
            ifc_class='IfcWindow' if w['type'] == 'window' else 'IfcDoor',
            name=f'{"Ventana" if w["type"] == "window" else "Puerta"} {index + 1}',
        )
        filling.OverallWidth = length
        filling.OverallHeight = opening_height
        run('spatial.assign_container', products=[filling], relating_structure=storey)
        run('geometry.edit_object_placement', product=filling, matrix=opening_matrix, is_si=True)
        run('feature.add_filling', opening=opening, element=filling)
    return model.to_string()
