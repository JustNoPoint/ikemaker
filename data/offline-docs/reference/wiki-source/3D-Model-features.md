# Overview
Ikemen GO uses the [glTF](https://www.khronos.org/Gltf) format (in either .glb or .gltf extensions) for loading and displaying 3D assets. This format can be exported to using modelling programs such as [Blender](https://www.blender.org/). Ikemen GO can display 3D models defined in stage and screenpack.

# Standard Features
Refer to [glTF™ 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) for full set of features in glTF2.0

Details about the standard glTF features supported by Ikemen GO:
* **COLOR_n** - Only COLOR_0 is supported
* **TEXCOORD_n** - Multiple texture coordinate is not supported. All textures use TEXCOORD_0
* **JOINTS_n,WEIGHTS_n** - Up to 2 sets of joins and weights are supported
* **Morph Target Animation** - Up to 8 active morphed attributes per primitive are supported

# Supported glTF Extensions
The following glTF extensions are supported:
* [KHR_animation_pointer](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_animation_pointer/README.md)
* [KHR_lights_punctual](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_lights_punctual/README.md)
(Up to 4 light sources are supported)
* [KHR_materials_unlit](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_unlit/README.md)
* [KHR_texture_transform](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_transform/README.md)

# Extras / Custom Properties
In addition to the extensions mentioned above, Ikemen GO can further tweak the rendering behavior on a per-object basis using a glTF node's "extras" field.

## trans
>Values: string of "ADD"/"SUB"/"MUL"/"NONE"  
>Default: "NONE"

Renders the object with the specified blending mode.

## id
>Values: integer
>Default: N/A

ID number used to identify a node. For use with the BGCtrl3D state controller.
This property can be applied to both nodes and animations inside a GLTF file.

## loopCount
>Values: integer
>Default: -1

Applies to animations. Controls the number of times an animation will loop. -1 is treated as infinity. Note the capital C (case-sensitive)

## enabled
>Values: string
>Default: "1"

Applies to animations. Controls whether the animation plays. Set this to "0" or "false" to disable.

## castShadow
>Values: integer  
>Default: 1

Applies to nodes. Toggles whether or not that object casts shadows. Set to 0 to disable.

## shadowMapBias:
>Values: float  
>Default: 0.02

Applies to lights, define the shadow map bias of the light. Increase this value to reduce shadow acne; Decrease this value to reduce peter panning.

## shadowMapNear, shadowMapFar, shadowMapBottom, shadowMapTop, shadowMapLeft, shadowMapRight:
>Values: float  
>Default: 0.1 (point/spot lights)/-20 (directional lights), 50, -20, 20, -20, 20

Applies to lights, define the shadow mapping frustum. The frustum should cover all the visible objects in order to produce correct result.

## disableZTest
>Values: boolean  
>Default: false

Applies to nodes. Disables depth testing. Not recommended unless you know exactly what you're doing.

## disableZWrite
>Values: boolean  
>Default: false

Applies to nodes. Disables writing to the depth buffer. Useful when rendering 2D stuffs in the model

## layerNumber
>Values: integer  
>Default: 0 (screenpack model / scene 0 of stage model), 1 (scene 1 of stage model)

Applies to nodes. Define the layer number of the node. Valid values are -1 (stage model only), 0, 1

## meshOutline
>Values: float  
>Default: 0

Apply to nodes. Extrude the back facing vertices to draw a outline around the mesh if the value is greater than 0. Thicker outline will be drawn if the value is larger.

# Custom Attributtes
## _OUTLINE_ATTRIBUTE
>Values: vec4  
>Default: (0,0,0,0)

Do nothing when mesh outline is not enabled. xyz of the attribute determines the direction of the vertex being extruded. w determines the amount of extrusion. Vertex normal will be used as the extrusion direction if this attribute is not provided.

# Mesh Outline
Ikemen GO uses inverted hull method to draw outline of mesh. **This method only works on opaque meshes with back face culling**.

Set ```meshOutline``` of the node to a value greater than 0 to enable the mesh outline. By default the back face vertices will be extruded alone the direction of the normal. Usually you will need to adjust the direction with the custom attribute ```_OUTLINE_ATTRIBUTE``` for geometry with sharp edges.