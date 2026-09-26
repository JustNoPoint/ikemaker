# <a name="changed">Changes to Background Parameters</a>

Some background parameters are carried over from MUGEN, but with their functionality altered.

## <a name="changed_bg">[BG] (shared parameters)</a>

### <a name="changed_bg_zoomdelta">zoomdelta</a>

>zoomdelta = *dzoom_x*, *dzoom_y* (float, float)  
>Specifies the amount that the camera zoom affects the scale of the element. Defaults to 1,1.  

The second item of `zoomdelta` is not read in MUGEN 1.1, but here it is processed as **Y direction** zoomdelta. If omitted, the same value as the first item is entered and the same processing as MUGEN 1.1 is performed.

### <a name="changed_bg_layerno">layerno</a>

>layerno = *layer_number* (int)  
>Specifies the stage layer on which the element will be drawn  

In addition to 0 and 1, this parameter now also accepts **-1**.  
Elements in layer **-1** will be drawn **behind layer 0**. While this does not alter stage functionality itself, it can allow characters to be drawn between the elements in those two layers.  

*Note:* For the sake of backwards compatibility, currently this feature only works in stages with `ikemenversion`.

## <a name="changed_bgctrl">[BGCtrl] (controllers)</a>

### <a name="changed_bgctrl_sinxy">SinX and SinY</a>

MUGEN 1.1 has a bug where `SinX` and `SinY` of a `BGCtrl` ignore the parent `BGCtrlDef` *looptime*. Therefore, in Ikemen GO, the movement of `SinX` and `SinY` of a stage created with MUGEN 1.1 in mind may look strange.  
This can be solved by **matching the looptime of `BGCtrlDef`** and the **period** (2nd value) of `SinX` and `SinY`.

# <a name="new">New Background Parameters</a>

Below are new parameters exclusive to Ikemen GO.

## <a name="new_bgdef">[BGDef] (definition)</a>

### <a name="new_bgdef_roundpos">RoundPos</a>

>RoundPos = *round_flag* (bool)  
>Set to 1 to round the position of background elements to floor, emulating older MUGEN behavior.

Defaults to **1** if `mugenversion` is below **1.0** and `ikemenversion` is **0** (older stages). Otherwise defaults to **1**.  
This parameter can also be used in an individual background element (`[BG]` block).

### <a name="new_bgdef_model">Model</a>

>Model = *model_file* (string)  
>Filename of a 3D model file. Supported: **gltf**, **glb**.

It is recommended to use PNG/JPEG/embedded image formats for textures. **Compressed DDS** textures are **not** supported.  
Make sure the world origin of the model is at the camera starting point.

### <a name="new_bgdef_scenenumber">SceneNumber</a>

>SceneNumber = *scene_number* (int)  
>Scene to use from a 3D model file. 

Defaults to 0. Requires `Model` to be defined.

### <a name="new_bgdef_fov">FOV</a>

>FOV = *field_of_view* (float)  
>Field of view used for a 3D model.

Defaults to 0. Requires `Model` to be defined.

### <a name="new_bgdef_near">Near</a>

>Near = *near_distance* (float)  
>The near plane of the view frustum when the 3D model is rendered.

Defaults to 0. It is recommended to set this to a low but non-zero value, such as `0.1`. Requires `Model` to be defined.

### <a name="new_bgdef_near">Far</a>

>Far = *far_distance* (float)  
>The far plane of the view frustum when the 3D model is rendered.

Defaults to 0. It is recommended to set this to a high value, such as `1000`. Requires `Model` to be defined.

### <a name="new_bgdef_modeloffset">ModelOffset</a>

>ModelOffset = *offset_x*, *offset_y*, *offset_z* (float, float, float)  
>Positional offset of a 3D model

Defaults to 0, 0, 0. Translates the model in 3D space, with (0, 0, 0) being the world origin of the model. Requires `Model` to be defined.

### <a name="new_bgdef_modelrotate">ModelRotate</a>

>ModelRotate = *rotate_x*, *rotate_y*, *rotate_z* (float, float, float)  
>Rotational offset of a 3D model

Defaults to 0, 0, 0. Rotates the model in 3D space around the world origin of the model. Requires `Model` to be defined.

### <a name="new_bgdef_modelscale">ModelScale</a>

>ModelScale = *scale_x*, *scale_y*, *scale_z* (float, float, float)  
>Scale factor of a 3D model

Defaults to 1, 1, 1. Scales the model around the world origin of the model. Requires `Model` to be defined.

## <a name="new_bgvideo">[BG] (type = video)</a>

Ikemen GO adds a **video** background type that plays media as a BG element. It uses the usual `[BG ...]` block and participates in draw order like other BG types.

### Media support
* **Containers:** WebM (`.webm`), Matroska (`.mkv`)  
* **Video codecs:** VP8, VP9  
* **Audio codecs:** Opus, Vorbis  
> Audio plays if present in the media.

### Coordinate system & base pivot
* **Stages:** base pivot is the **center of the screen**.  
* **Motifs & storyboards:** base pivot is the **top-left of the screen**.

### Parameters (video-specific)
>type = `video` (string, required)  
>Must be set to `video`.

>path = *filepath* (string, required)  
>Path to the media file. By default resolves relative to the engine’s **video** directory (absolute paths also supported).

>volume = *volume* (int, optional)  
>Audio playback volume. Defaults to **100**.

>loop = *loop_flag* (boolean int, optional)  
>Set to **1** to loop the video. Defaults to **0**.

>scalemode = *mode* (string, optional)  
>How the video frame is sized into the window. Defaults to **none**.  
>`none` (no scaling) · `fit` (uniform fit, letter/pillar-box if needed) · `fitwidth` (match width; crop/pad height) · `fitheight` (match height; crop/pad width) · `zoomfill` (uniform cover; center-crop overflow) · `stretch` (non-uniform fill; may distort).

>scalefilter = *filter* (string, optional)  
>Scaling filter. Defaults to **fastbilinear**. Options: `lanczos`, `fastbilinear`, `bilinear`, `bicubic`, `experimental`, `neighbor`, `area`, `bicublin`, `gauss`, `sinc`, `spline`.

*Note:* Element-level transforms like `scalestart`/`scaledelta` and camera zoom (`zoomdelta`, `zoomscaledelta`) are applied **in addition** to the size implied by `scalemode`.

### Standard background parameters
The following work with video the same as for normal/anim elements unless noted:  
`layerno`, `start`, `delta`, `positionlink`, `id`, `velocity`, `sin.x`, `sin.y`, `scalestart`, `scaledelta`, `zoomdelta`, `zoomscaledelta`, `maskwindow`, `window`, `windowdelta`, `roundpos`, `angle`, `xangle`, `yangle`, `projection`, `focallength`, `xshear`.

### Untested
`trans`, `alpha`, `palfx`.

## <a name="new_bg">[BG] (shared parameters)</a>

### <a name="new_bg_angle">Angle</a>

>Angle = *angle* (int)  
>Specifies the rotation angle of the BG element. Defaults to 0.

### <a name="new_bg_xangle">XAngle</a>

>XAngle = *xangle* (int)  
>Specifies the X-axis rotation of the BG element. Defaults to 0.

### <a name="new_bg_yangle">YAngle</a>

>YAngle = *yangle* (int)  
>Specifies the Y-axis rotation of the BG element. Defaults to 0.

### <a name="new_bg_autoresizeparallax">AutoResizeParallax</a>

>AutoResizeParallax = *resize_flag* (boolean)  
>Set to 1 to auto-correct parallax size when zooming out. Defaults to 0.

Specifies whether to automatically adjust the size of `parallax` elements when zooming out. By setting this to **0** and specifying `ZoomDelta`, you can reproduce the same behavior as when `parallax` zooms out in MUGEN 1.1.

### <a name="new_bg_xbottomzoomdelta">XBottomZoomDelta</a>

>XBottomZoomDelta = *xzoom* (float)  
>Specifies the X scale reduction rate of the **bottom edge** of the image when zooming out. Omitted by default.

Countermeasure for stages using `parallax` where the X scale on the bottom surface becomes abnormally small / freezes at severe zoom-out (by design). Works **only if** [`AutoResizeParallax`](#new_bg_autoresizeparallax) is set to **1**.

### <a name="new_bg_projection">projection</a>

>Projection = *projection* (string)  
>`perspective`: distortion relative to the **center of the screen**  
>`perspective2`: distortion relative to the **sprite**  
>`orthographic`: no distortion  
Defaults to `orthographic`.

### <a name="new_bg_focallength">FocalLength</a>

>FocalLength = *focallength* (float)  
>Focal length for perspective projections. Has no effect unless `projection` is `perspective` or `perspective2`.

### <a name="new_bg_xshear">XShear</a>

>XShear = *xshear* (float)  
>Specifies horizontal shearing to apply to the BG element. Defaults to 0.

### <a name="new_bg_zoomscaledelta">ZoomScaleDelta</a>

>ZoomScaleDelta = *zscale_dx*, *zscale_dy* (float, float)  
>Reverse-correction of `ZoomDelta`. Defaults to 0,0.

Applies an inverse correction to `ZoomDelta`, mainly to correct image ratio distortion when zooming out. Reads two values for X and Y; you may apply the correction to just one axis by omitting the other.

## <a name="new_bgctrl">[BGCtrl] (controllers)</a>

### <a name="new_bgctrl_palfx">PalFX</a>

Works like character `PalFX`, but for **background elements**. The effect is applied **permanently** (due to how `BGCtrl`s work). To reset it, declare `PalFX` again with empty parameters (all are optional). Using `BGPalFX` in a character will temporarily override all `PalFX` `BGCtrl`.

*Example syntax:*

```ini
; Example only — actual parameters mirror char PalFX
[BGCtrl pal_example]
type = PalFX
time = 0, 60
; add = r,g,b
; mul = r,g,b
; sinadd = r,g,b, period, offset
```

### <a name="new_bgctrl_remappal">RemapPal</a>

Remaps a palette from the stage SFF file to another palette from the same file. This can be used to perform static palette changes without duplicating sprites, and to remap palettes dynamically using `ModifyBGCtrl`.

*Example syntax:*

```ini
[BGCtrl 1]
type = RemapPal
time = 200
source = 0,0
dest = 2,5
```

### <a name="new_bgctrl_sctrlid">SctrlId</a>

>sctrlid = *ID* (int)  
>Specifies an ID number to refer to this background controller block by.

Used so a character’s [`ModifyBGCtrl`](State-controllers-(new)#modifybgctrl) can target specific stage background controllers. Different controllers may share the same ID if necessary.