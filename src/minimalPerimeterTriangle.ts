
import * as Inscribe from './inscribe/Inscribe';

import { Vec2, Line, Side } from './Geometry';

export function lineTangentToHull(line: Line, points: Vec2[], halo: number): { holds: boolean, side: number } {
    let holds = true;
    let side = Side.Top;

    let k = 0;
    while(side === Side.Top && k < points.length) {
        side = line.pointOnSide(points[k], halo);
        k++;
    }

    for(let i = k; i < points.length; i++) {
        const test_side = line.pointOnSide(points[i], halo);
        if(test_side === Side.Top) { continue; }
        if(test_side !== side) {
            holds = false;
            break;
        }
    }

    return { holds: holds, side: side };
}

/**
 * Solves an optimization problem of finding the shortest third side for a given wedge such that they
 * enclose the given convex hull.
 * Such side, if found, will be generated by a Line which start will lie on the left arm of the wedge
 * and end will be P or Q (as described in the reference to the main function).
 */
function findEnclosingSide(wedge: Inscribe.Wedge, startVertex: number, endVertex: number, points: Vec2[], halo: number):
    { side: Line, stopVertex: number } | null {
    // Eclosing side
    let side: Line | null = null;
    let stopVertex = startVertex;

    let vertex = startVertex;

    do {
        const p1 = points[vertex];

        // Investigate a possibility for an edge to generate the side
        if(vertex > endVertex) {
            // Edge can be constructed
            const p2 = points[vertex - 1];
            const edge = new Line(p1, p2);

            // Edge Line is only considered if it is loosely contained within the wedge
            if(wedge.looselyContains(p1, halo) && wedge.looselyContains(p2, halo)) {
                const circles = wedge.fitCircles(edge, halo);
                if(circles !== null) {
                    // In case of a degenerate wedge there will be 2 circles.
                    // In a more commong case of a regular wedge there will be only 1 circle.
                    // In each case the circle has to touch the edge and not its extension.
                    let tangentParameter = 100;
                    if(wedge.isDegenerate) {
                        // Choose such a circle that it has its centre on a different side
                        let sidedness = Side.Top;
                        let k = 0;
                        while(sidedness === Side.Top && k < points.length) {
                            sidedness = edge.pointOnSide(points[k], halo);
                            k++;
                        }

                        tangentParameter =
                            edge.pointOnSide(circles[0].circle.centre) !== sidedness
                                ? circles[0].tangentParameter
                                : circles[1].tangentParameter;
                    } else {
                        tangentParameter = circles[0].tangentParameter;
                    }

                    // Check whether this tangent point belongs to the edge
                    if(0 < tangentParameter && tangentParameter < 1) {
                        const Y = edge.evaluate(tangentParameter);
                        const joint = wedge.left_arm.intersectionPoint(edge, halo) !;
                        side = new Line(joint, Y);
                    }
                }
            }
        }

        // Investigate for p1 to generate the side if it's still not found
        if(side === null) {
            // p1 has to be strictly within the wedge
            if(wedge.strictlyContains(p1, halo)) {
                const circles = wedge.fitCircles(p1, halo);
                if(circles !== null) {
                    // In case of a degenerate wedge there will be 2 circles.
                    // In a more commong case of a regular wedge there will be only 1 circle.
                    // In each case the circle has to also be tangent to the hull.
                    let tangent: Line;
                    if(wedge.isDegenerate) {
                        // Choose such a circle that it has its centre on a different side
                        let sidedness = Side.Top;
                        let k = 0;
                        while(sidedness === Side.Top && k < points.length) {
                            sidedness = circles[0].tangent.pointOnSide(points[k], halo);
                            k++;
                        }

                        tangent =
                            circles[0].tangent.pointOnSide(circles[0].circle.centre, halo) !== sidedness
                                ? circles[0].tangent
                                : circles[1].tangent;
                    } else {
                        tangent = circles[0].tangent;
                    }

                    // `tangent` is such that:
                    // 1. it is tangent to a circle going through p1,
                    // 2. it separates the centre of this circle and the hull points
                    // If it is also tangent to the hull => it generates the side
                    if(lineTangentToHull(tangent, points, halo).holds) {
                        const joint = wedge.left_arm.intersectionPoint(tangent, halo) !;
                        side = new Line(joint, p1);
                    }
                }
            }
        }

        if(side !== null) {
            // Make a note of the stopping vertex
            stopVertex = vertex;
        } else {
            vertex--;
        }

    } while(side === null && vertex >= endVertex);

    return side === null ? null : { side: side, stopVertex: stopVertex };
}

function findAntipode(points: Vec2[]) {
    // find the farthest point from the start and end point of the range
    let farthestIndex: number = 0;
    let farthestDist: number = 0;

    for(let i: number = 0, n: number = points.length; i < n; i++) {
        //check if considered point is farther than farthest
        let testDist: number = new Line(points[0], points[n - 1]).distanceToPoint(points[i]);
        if(testDist > farthestDist) {
            farthestDist = testDist;
            farthestIndex = i;
        }
    }

    return farthestIndex;
}

/**
 * Finds a minimal perimeter triangle enclosing a convex hull of an _arc_ trace
 * The longest side of the hull is considered to be a bottom of the triangle and _is fixed_.
 * This procedure is tailored from the generic algorithm given in
 *      http://scholar.uwindsor.ca/cgi/viewcontent.cgi?article=2527&context=etd
 * starting from p. 22; In the notation of the generic algorithm BC is fixed
 * @export
 * @param {Vec2[]} points convex hull representing an arc trace
 * @returns {({ A: Vec2, B: Vec2, C: Vec2 } | null)} triangle or null if failed
 */
export function minTriangleWithBase(convexHull: Vec2[], err: number): { A: Vec2, B: Vec2, C: Vec2 } | null {
    // Sides of the triangle
    let AB: Line, AC: Line;

    // The arrangement of the points assures that the base is formed by the first
    // and the last point of the hull
    let n = convexHull.length,
        BC = new Line(convexHull[0], convexHull[n - 1]);

    // Find the antipodal point to the base, i.e. the farthest point
    let antipodIndex = findAntipode(convexHull);
    let baseParallel = new Line(convexHull[antipodIndex], convexHull[antipodIndex].plus(BC.delta)) !;

    // Bootstrap the algorithm with a degenerate wedge
    let wedge = Inscribe.Wedge.new(BC, baseParallel, err) !;

    // Progress of the algorithm through the verices (see ref.)
    let Pn = n, Qn = antipodIndex + 1;

    do { //iterations

        const CQinfo = findEnclosingSide(wedge, Math.min(n - 1, Pn), antipodIndex, convexHull, err);
        if(CQinfo === null) { return null; }
        ({ side: AC, stopVertex: Pn } = CQinfo);

        // FYI: Q = AC.end;

        // reconstruct the wedge with left arm as is and right arm being the recently found side
        wedge = Inscribe.Wedge.new(wedge.left_arm, AC, err) !;

        const BPinfo = findEnclosingSide(wedge, Math.min(antipodIndex, Qn), 0, convexHull, err);
        if(BPinfo === null) { return null; }
        ({ side: AB, stopVertex: Qn } = BPinfo);

        // FYI: P = AB.end;

        wedge = Inscribe.Wedge.new(wedge.left_arm, AB, err) !;

        // By design |AB| >= |AC| (see ref.), stop when they are close
    } while(AB.length - AC.length > 0.1);

    const
        A = AC.intersectionPoint(AB, 0) !,
        B = AB.start,
        C = AC.start;

    return { A: A, B: B, C: C };
}

export function minTriangle(convexHull: { x: number, y: number }[], err: number):
    { A: { x: number, y: number }, B: { x: number, y: number }, C: { x: number, y: number } } | null {
    if(convexHull.length < 3) {
        return null;
    }

    if(convexHull.length === 3) {
        return { A: convexHull[0], B: convexHull[1], C: convexHull[2] };
    }

    let points = convexHull.map((p: { x: number, y: number }) => { return new Vec2(p.x, p.y); });

    let A: Vec2 | null = null,
        B: Vec2 | null = null,
        C: Vec2 | null = null,
        perimeter: number = -1;

    let rotations: number = 0;

    while(rotations < points.length) {
        // rotate array of points
        if(rotations > 0) {
            points.push(points.shift() !);
        }

        // re-calculate the triangle
        const triangle = minTriangleWithBase(points, err);

        //assert triangle is found
        if(triangle !== null) {
            const {A: A1, B: B1, C: C1} = triangle;

            const perimeter1 = A1.minus(B1).norm + B1.minus(C1).norm + C1.minus(A1).norm;
            if(perimeter1 < perimeter || perimeter === -1) {
                [A, B, C] = [A1, B1, C1];
                perimeter = perimeter1;
            }
        }

        rotations++;
    }

    return perimeter === -1
        ? null
        : {
            A: { x: A!.x, y: A!.y },
            B: { x: B!.x, y: B!.y },
            C: { x: C!.x, y: C!.y }
        };
}
