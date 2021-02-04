import React, { useEffect, useRef, useState } from 'react'
import { camvas } from '../pico/examples/camvas'
import { pico } from '../pico/pico'
import { lploc } from '../pico/lploc'
import classes from './canvas.module.sass'

const canvasProps = {
    width: 640,
    height: 480,
}
const radius = 150
let captureProps = {
    x: canvasProps.width / 2,
    y: canvasProps.height / 2,
    radiusX: radius,
    radiusY: radius,
    startAngle: 0,
    endAngle: 2 * Math.PI,
}

export const Canvas = () => {
    const cRef = useRef(null)
    const [multiplier, setMultiplier] = useState(1)
    const [isReadyBtn, setBtnReady] = useState(false)
    const [canvases, setCanvas] = useState([])
    const vRef = useRef(null)
    

    useEffect(() => {
        const getCaptureProperties = () => {
            const {x, y, radiusX, radiusY, startAngle, endAngle} = captureProps
            return [x, y, radiusX * multiplier * .9, radiusY * multiplier, startAngle, endAngle, false]
        }


        const ctx = cRef.current;
        var update_memory = pico.instantiate_detection_memory(5); // we will use the detecions of the last 5 frames
        var facefinder_classify_region = function (r, c, s, pixels, ldim) { return -1.0; };
        var cascadeurl = 'https://raw.githubusercontent.com/nenadmarkus/pico/c2e81f9d23cc11d1a612fd21e4f9de0921a5d0d9/rnt/cascades/facefinder';
        fetch(cascadeurl).then(function (response) {
            response.arrayBuffer().then(function (buffer) {
                var bytes = new Int8Array(buffer);
                facefinder_classify_region = pico.unpack_cascade(bytes);
                console.log('* facefinder loaded');
            })
        })
        /*
            (2) initialize the lploc.js library with a pupil localizer
        */
        let do_puploc = function (r, c, s, nperturbs, pixels, nrows, ncols, ldim) { return [-1.0, -1.0]; };
        const puplocurl = 'https://drone.nenadmarkus.com/data/blog-stuff/puploc.bin'
        fetch(puplocurl).then(function (response) {
            response.arrayBuffer().then(function (buffer) {
                var bytes = new Int8Array(buffer);
                do_puploc = lploc.unpack_localizer(bytes);
                console.log('* puploc loaded');
            })
        })
        
        function rgba_to_grayscale(rgba, nrows, ncols) {
            var gray = new Uint8Array(nrows * ncols);
            for (var r = 0; r < nrows; ++r)
                for (var c = 0; c < ncols; ++c)
                    // gray = 0.2*red + 0.7*green + 0.1*blue
                    gray[r * ncols + c] = (2 * rgba[r * 4 * ncols + 4 * c + 0] + 7 * rgba[r * 4 * ncols + 4 * c + 1] + 1 * rgba[r * 4 * ncols + 4 * c + 2]) / 10;
            return gray;
        }
        /*
            (4) this function is called each time a video frame becomes available
        */
        var processfn = function (video, dt) {
            vRef.current = video
            // render the video frame to the canvas element and extract RGBA pixel data
            ctx.drawImage(video, 0, 0);
            var rgba = ctx.getImageData(0, 0, 640, 480).data;
            // prepare input to `run_cascade`
            const image = {
                "pixels": rgba_to_grayscale(rgba, 480, 640),
                "nrows": 480,
                "ncols": 640,
                "ldim": 640
            }
            const params = {
                "shiftfactor": 0.1, // move the detection window by 10% of its size
                "minsize": 100,     // minimum size of a face
                "maxsize": 1000,    // maximum size of a face
                "scalefactor": 1.1  // for multiscale processing: resize the detection window by 10% when moving to the higher scale
            }
            let dets = pico.run_cascade(image, facefinder_classify_region, params);
            dets = update_memory(dets);
            dets = pico.cluster_detections(dets, 0.2); // set IoU threshold to 0.2
            // draw detections
            for (let i = 0; i < dets.length; ++i) {
                const capture = getCaptureProperties()
                if (dets[i][3] > 50.0) {
                    //
                    ctx.beginPath();
                    const x = dets[i][1]
                    const y = dets[i][0]
                    const radiusX = (dets[i][2] * .9) / 2
                    const radiusY = dets[i][2] / 2
                    const startAngle = 0
                    const endAngle = 2 * Math.PI
                    ctx.ellipse(x, y, radiusX, radiusY, startAngle, endAngle, false);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'red';
                    ctx.stroke();
                    ctx.closePath();
                    const isEntered = Math.sqrt(capture[0] - x) + Math.sqrt(capture[1] - y) < Math.sqrt(capture[3] - radiusY)
                    if (isEntered) {
                        setTimeout(() => setBtnReady(true))
                    } else if (isReadyBtn) {
                        setTimeout(() => setBtnReady(false))
                    }
                }
                ctx.beginPath();
                ctx.ellipse(...capture);
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'green';
                ctx.stroke();
                ctx.closePath();
            }
        }
        const camObject = new camvas({canvasRef: cRef.current}, processfn)
        return () => {
            camObject.remove()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [multiplier])

    return (
        <div>
            <canvas ref={(canv) => canv && (cRef.current = canv.getContext('2d'))} {...canvasProps}></canvas>
            <button disabled={!isReadyBtn} onClick={() => {
                setMultiplier(multiplier * .9)
                setCanvas([...canvases,vRef.current])
            }} className={`${classes.btn} ${isReadyBtn && classes.ready}`}>Capture</button>
            {canvases.map((video) => <Single canv={video} />)}
        </div>
    )
}

const Single = ({canv}) => {
    const ref = useRef(null)
    useEffect(() => {
        const ctx = ref.current.getContext('2d')

        ctx.drawImage(canv, 0, 0, 100, 100 * (canvasProps.height / canvasProps.width))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return <canvas ref={ref} width={canvasProps.width * .4} height={canvasProps.height * .4} />
}
