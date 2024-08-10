const {createCanvas} = require('@napi-rs/canvas');
const { LatLon, cornerCalTransform } = require('./utils');
const JSZip = require('jszip');

Number.prototype.mod = function (n) {
  "use strict";
  return ((this % n) + n) % n;
};

const drawRouteXY = (img, routes, res) => {
    const canvas =  createCanvas(
        Math.round(img.width / res),
        Math.round(img.height / res)
    );
    
    const ctx = canvas.getContext('2d');
  
    // draw a background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  
    ctx.drawImage(img, 0, 0, Math.round(canvas.width), Math.round(canvas.height));
  
    const weight = 6;
  
    const canvas2 = createCanvas(canvas.width, canvas.height);
    const ctx2 = canvas2.getContext('2d');

    ctx2.lineWidth = weight;
    const circleSize = 30
    ctx2.strokeStyle = '#f403fc';
    ctx2.beginPath();
    
    routes.forEach(routePts => {
        for(let i=0; i < routePts.length - 1; i++) {
            // avoid division by zero
            if (routePts[i].x === routePts[i+1].x) {
                routePts[i].x -= 0.0001
            }

            const pt = routePts[i];
            const nextPt = routePts[i+1]
            const angle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x);

            // Start Triangle
            if (i === 0) {
                ctx2.moveTo(
                    Math.round(pt.x + circleSize * Math.cos(angle)),
                    Math.round(pt.y + circleSize * Math.sin(angle))
                )
                ctx2.lineTo(
                    Math.round(pt.x + circleSize * Math.cos(angle + 2 / 3 * Math.PI)),
                    Math.round(pt.y + circleSize * Math.sin(angle + 2 / 3 * Math.PI))
                )
                ctx2.lineTo(Math.round(pt.x + circleSize * Math.cos(angle - 2 / 3 * Math.PI)), Math.round(pt.y + circleSize * Math.sin(angle - 2 / 3 * Math.PI)))
                ctx2.lineTo(Math.round(pt.x + circleSize * Math.cos(angle)), Math.round(pt.y + circleSize * Math.sin(angle)))
            }
            ctx2.moveTo(
                Math.round(pt.x + circleSize * Math.cos(angle)),
                Math.round(pt.y + circleSize * Math.sin(angle))
            )
            ctx2.lineTo(
                Math.round(nextPt.x - circleSize * Math.cos(angle)),
                Math.round(nextPt.y - circleSize * Math.sin(angle))
            )
            ctx2.moveTo(
                Math.round(nextPt.x + circleSize),
                Math.round(nextPt.y)
            )
            ctx2.arc(
                nextPt.x,
                nextPt.y,
                circleSize,
                0,
                2 * Math.PI
            )
            if (i === routePts.length - 2) {
                ctx2.moveTo(
                    Math.round(nextPt.x + circleSize - 5),
                    Math.round(nextPt.y)
                )
                ctx2.arc(
                    nextPt.x,
                    nextPt.y,
                    circleSize - 10,
                    0,
                    2 * Math.PI
                )    
            }
        }
        for(let i = 1; i < routePts.length - 1; i++) {
            const prevPt = routePts[i-1]
            const pt = routePts[i]
            const nextPt = routePts[i+1]

            const prevAngle = Math.atan2(prevPt.y - pt.y, prevPt.x - pt.x);
            const nextAngle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x);
            const angleDiff = ((nextAngle - prevAngle + Math.PI).mod(2 * Math.PI)) - Math.PI
            const avgAngle = (prevAngle + angleDiff / 2).mod(2 * Math.PI)
            const oppAngle = avgAngle + Math.PI;
            ctx2.textAlign = "center"
            ctx2.fillStyle = '#f403fc'
            ctx2.font = "" + (circleSize * 1.6) + "px Arial"
            ctx2.fillText(
                "" + i,
                Math.round(pt.x + Math.cos(oppAngle) * (circleSize * 2)),
                Math.round(pt.y + circleSize * 0.8 + Math.sin(oppAngle) * (circleSize * 2))
            )
        }
    })
    ctx2.stroke();
    ctx.globalAlpha = 0.7;
    ctx.drawImage(canvas2, 0, 0);
    return canvas;
};

const drawRouteLatLng = (img, bounds, routes, res) => {
    const transform = cornerCalTransform(
        Math.round(img.width / res),
        Math.round(img.height / res),
        bounds[3],
        bounds[2],
        bounds[1],
        bounds[0]
    );
    const routesXY = routes.map((route) => 
        route.map((p) => {
            const loc = new LatLon(p.control.position.latitude, p.control.position.longitude);
            const pt = transform(loc);
            return pt
        })
    );
    return drawRouteXY(img, routesXY, res);
}

const getKml = (name, corners_coords) => {
    return `<?xml version="1.0" encoding="utf-8"?>
  <kml xmlns="http://www.opengis.net/kml/2.2"
        xmlns:gx="http://www.google.com/kml/ext/2.2">
    <Document>
      <Folder>
        <name>${name}</name>
        <GroundOverlay>
          <name>${name}</name>
          <drawOrder>50</drawOrder>
          <Icon>
            <href>files/doc.webp</href>
          </Icon>
          <altitudeMode>clampToGround</altitudeMode>
          <gx:LatLonQuad>
            <coordinates>
              ${corners_coords.bottom_left.lon},${corners_coords.bottom_left.lat} ${corners_coords.bottom_right.lon},${corners_coords.bottom_right.lat} ${corners_coords.top_right.lon},${corners_coords.top_right.lat} ${corners_coords.top_left.lon},${corners_coords.top_left.lat}
            </coordinates>
          </gx:LatLonQuad>
        </GroundOverlay>
      </Folder>
    </Document>
  </kml>`;
  }
  
  const saveKMZ = async (name, bound, imgBlob) => {
    var zip = new JSZip();
    zip.file("doc.kml", getKml(name, bound));
    var img = zip.folder("files");
    img.file("doc.webp", imgBlob);
    return zip.generateAsync({type:"nodebuffer"})
      .then(function(content) {
          return content;
      });
  }

  async function getProj4Def(crs) {
    const resp = await fetch(`https://epsg.io/${crs}.proj4`);
    return resp.text()
  }

  module.exports = {
      drawRouteXY,
      drawRouteLatLng,
      saveKMZ,
      getProj4Def
  }
