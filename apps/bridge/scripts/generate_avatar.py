import bpy
import sys
import json
import argparse
import math
import random

def clean_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

def create_material(params):
    mat = bpy.data.materials.new(name="AvatarMaterial")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    
    # Clear default nodes
    nodes.clear()
    
    output = nodes.new(type='ShaderNodeOutputMaterial')
    shader = nodes.new(type='ShaderNodeBsdfPrincipled')
    
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    
    # Set properties based on params
    color = params['color']
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Roughness'].default_value = params['roughness']
    
    if params['type'] == 'metallic':
        shader.inputs['Metallic'].default_value = 1.0
    elif params['type'] == 'glass':
        shader.inputs['Transmission'].default_value = 1.0
        shader.inputs['Roughness'].default_value = 0.0
    elif params['type'] == 'emissive':
        shader.inputs['Emission'].default_value = color
        shader.inputs['Emission Strength'].default_value = 5.0
        
    return mat

def create_geometry(params, material):
    geo_type = params['type']
    obj = None
    
    if geo_type == 'icosahedron':
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=params['subdivisions'])
    elif geo_type == 'torus':
        bpy.ops.mesh.primitive_torus_add()
    elif geo_type == 'cube':
        bpy.ops.mesh.primitive_cube_add()
        # Add subdivision modifier to make it look cooler
        bpy.context.object.modifiers.new(name="Subsurf", type='SUBSURF')
        bpy.context.object.modifiers["Subsurf"].levels = params['subdivisions']
    elif geo_type == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add()
        
    obj = bpy.context.active_object
    
    if params['wireframe']:
        mod = obj.modifiers.new(name="Wireframe", type='WIREFRAME')
        mod.thickness = 0.02
        
    if obj:
        obj.data.materials.append(material)
        
    return obj

def setup_lighting():
    # Key Light
    bpy.ops.object.light_add(type='AREA', location=(5, 5, 5))
    light = bpy.context.active_object
    light.data.energy = 500
    
    # Fill Light
    bpy.ops.object.light_add(type='POINT', location=(-5, -5, 2))
    light = bpy.context.active_object
    light.data.energy = 200
    light.data.color = (0.0, 0.5, 1.0) # Blueish fill
    
    # Rim Light
    bpy.ops.object.light_add(type='SPOT', location=(0, 5, -5))
    light = bpy.context.active_object
    light.data.energy = 1000
    light.rotation_euler = (math.radians(135), 0, 0)

def setup_camera():
    bpy.ops.object.camera_add(location=(0, -8, 4))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(60), 0, 0)
    bpy.context.scene.camera = cam

def create_particles(params):
    # Create a simple emitter
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0,0,0))
    emitter = bpy.context.active_object
    emitter.hide_render = True
    
    psys = emitter.modifiers.new("Particles", type='PARTICLE_SYSTEM').particle_system
    psys.settings.count = params['particleCount']
    psys.settings.frame_start = 1
    psys.settings.frame_end = 1
    psys.settings.lifetime = 100
    psys.settings.physics_type = 'NO' # Static particles
    
    # Render as small icospheres
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.1)
    particle_obj = bpy.context.active_object
    particle_obj.hide_render = True # Hide original
    
    # Create emissive material for particles
    mat = bpy.data.materials.new(name="ParticleMat")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (*params['particleColor'], 1.0)
    emit.inputs['Strength'].default_value = 10.0
    mat.node_tree.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    particle_obj.data.materials.append(mat)
    
    psys.settings.render_type = 'OBJECT'
    psys.settings.instance_object = particle_obj

def main():
    # Parse arguments
    # argv will contain: ['--output', 'path', '--params', 'json']
    # We need to strip blender args first
    if "--" not in sys.argv:
        print("No arguments passed after --")
        return

    args = sys.argv[sys.argv.index("--") + 1:]
    
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--params', required=True)
    
    parsed_args = parser.parse_args(args)
    
    try:
        params = json.loads(parsed_args.params)
    except json.JSONDecodeError:
        print("Invalid JSON params")
        sys.exit(1)

    # Setup Scene
    clean_scene()
    
    # Create Avatar
    mat = create_material(params['material'])
    obj = create_geometry(params['geometry'], mat)
    
    if obj:
        # Apply transforms
        obj.rotation_euler = [math.radians(x) for x in params['transform']['rotation']]
        s = params['transform']['scale']
        obj.scale = (s, s, s)
    
    setup_lighting()
    setup_camera()
    create_particles(params['environment'])
    
    # Render Settings
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES' # or 'BLENDER_EEVEE' for speed
    scene.cycles.samples = 32 # Low samples for speed in this demo
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.film_transparent = True
    
    # Save as .blend file
    bpy.ops.wm.save_as_mainfile(filepath=parsed_args.output)
    
    # Optional: Still render a preview if needed, but the main output is the blend file
    # For now, we just save the file as requested.

if __name__ == "__main__":
    main()
