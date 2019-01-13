var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");

var ticks = 0;
var spriteMap = new Image;
var actors;
var items;
var debug = false;

// default theme and level
var theme = 'ben_lisa';
var current_level = levels[4];

var gameInterval;
var score;

// position displayed level
var scroll_x = 0;
// scroll position at the beginning of the game loop
var scroll_x_start = 0;
// 5 free lines on top, 13 lines of level content
var line_offset_y = 5;

var held = {left:false, right:false, up:false, down:false};
var collisionMap;

// fps measurement
var filterStrength = 20;
var frameTime = 0, lastLoop = new Date, thisLoop;


// speed, gravity parameters
var speed = {
    player:{
        velocity_x:1.5,
        velocity_x_jump:1.5,
        velocity_y:25,
        gravity:2,
        friction:0.8,
        speed_limit_y:25
    },
    fps:30
}

// size details
var size = {
    tile:{ // size of tiles
        source:{w:16, h:16},
        target:{w:32, h:32}
    },
    tiles:{ // number of tiles
        target:{w:1, h:1} // this is set dynamically depending on the canvas size
    },
    canvas:{w:1, h:1} // the canvas size is read from the actual html
};

player = {
    pos: {x:0, y:0},
    sprite: {x:0, y:32},
    source_size: {w:32, h:32},
    target_size: {w:42, h:42},
    speed: {x:0, y:0},
    spriteMap: new Image,
    lives: 3
};


String.prototype.replaceAt = function (index, characters) {
    return this.substr(0, index) + characters + this.substr(index + characters.length);
};

Number.prototype.inRange = function (a, b) {
    var n = +this;
    return ( n >= a && n <= b );
};



function drawLevel() {

    // clear the canvas before repainting
    ctx.clearRect(0, 0, size.canvas.w, size.canvas.h);
    collisionMap = [];

    if (scroll_x < 0) {
        scroll_x = 0;
    }
    scroll_x_start = scroll_x;
    // first tile to display:
    var index_x_start = scroll_x / size.tile.target.w
    var offset_x = scroll_x % size.tile.target.w
    // last tile to show
    var index_x_max = index_x_start + size.tiles.target.w + 1

    current_level.level.forEach(function (linecontent, index_y) {
            index_y += line_offset_y;
            for (var index_x = index_x_start; index_x < index_x_max; index_x++) {
                var object = getLevelObject(linecontent.charAt(index_x), index_x, index_y);
                if (object) {
                    object.x = index_x * size.tile.target.w - offset_x
                    object.y = index_y * size.tile.target.h

                    // workaround failed local image load
                    if (object.sprite.src){
                        ctx.drawImage(object.sprite, object.x - index_x_start * size.tile.target.w, object.y)
                    } else {
                        ctx.drawImage(spriteMap,
                            object.sx * (size.tile.source.w + 1) + 0.5,
                            object.sy * (size.tile.source.h + 1) + 0.5,
                            size.tile.source.w - 0.8,
                            size.tile.source.h - 0.8,
                            object.x - index_x_start * size.tile.target.w, object.y,
                            size.tile.target.w, size.tile.target.h)
                    }

                    if (object.collide) {
                        collisionMap.push(object.cloneBlock());
                    }
                    if (object.type == 'enemy_mushroom') {
                        items.push(object.cloneBlock());
                        replaceLevelSprite(index_x, index_y - line_offset_y, " ");
                    } else if (object.type == 'coin') {
                        items.push(object.cloneBlock());
                        replaceLevelSprite(index_x, index_y - line_offset_y, " ");
                    }
                }
            }
        }
    );
}


// update position of characters, collision detection
function updateCharacters() {

    actors.forEach(function (actor) {

        if (actor.speed.y == 0) {
            if (held.left && actor.speed.y == 0) {
                actor.speed.x -= speed.player.velocity_x;
            } else if (held.right && actor.speed.y == 0) {
                actor.speed.x += speed.player.velocity_x;
            }
        } else {
            if (held.left) {
                actor.speed.x -= speed.player.velocity_x_jump;
            } else if (held.right) {
                actor.speed.x += speed.player.velocity_x_jump;
            }
        }
        if (held.up && actor.speed.y == 0) {
            sound_jump();
            actor.speed.y -= speed.player.velocity_y;
        } else if (held.down) {
            // this only causes a duck animation, nothing happens in term of speed
        }
        held.up = false;

        animate_actor(actor);

        // apply gravity.
        actor.speed.y += speed.player.gravity;
        if (Math.abs(actor.speed.x) < 0.8) actor.speed.x = 0;
        if (Math.abs(actor.speed.y) < 0.1) actor.speed.y = 0;

        // apply speed limit when falling down
        if (actor.speed.y > speed.player.speed_limit_y) {
            actor.speed.y = speed.player.speed_limit_y
        }

        actor.pos.x += actor.speed.x;
        actor.pos.y += actor.speed.y;

        // block on level edge
        if (actor.pos.x < 0) {
            actor.pos.x = 0;
        } else if (actor.pos.x + actor.target_size.w > current_level.width) {
            actor.pos.x = current_level.width - actor.target_size.w;
        }
        // die on level bottom
        if (actor.pos.y > size.canvas.h) {
            gameOver();
        }

        // add visible items + actors to collision check
        // todo: only add visible items
        collisionMap = collisionMap.concat(items);

        collisionMap.forEach(function (object) {

            var collides = checkCollision(actor, object);

            // apply collision to player movement
            // special actions on collisions
            if (object.solid) {
                if (collides.top) {
                    if (object.type == 'block_coin') {
                        replaceLevelSpriteXY(object.x, object.y, "ß");
                        items.push({ sx:8, sy:9, x:object.x, y:(object.y - size.tile.target.h), type:'coin' });
                    } else {
                        actor.pos.y = object.y + size.tile.target.h;
                        actor.speed.y = 1;
                    }
                } else if (collides.bottom) {
                    // jump on enemy
                    if (object.type == 'enemy_mushroom') {
                        object.deadly = false;
                        object.speed = 0;
                        object.sx = 2;
                        score++;
                        sound_jump_on_enemy();
                    }
                    actor.pos.y = object.y - actor.target_size.h;
                    actor.speed.y = 0;
                } else if (collides.right) {
                    actor.pos.x = object.x - actor.target_size.w;
                    actor.speed.x = 0;
                } else if (collides.left) {
                    actor.pos.x = object.x + size.tile.target.w;
                    actor.speed.x = 0;
                }
            }

            // collide from any side
            if (collides.top || collides.bottom || collides.right || collides.left) {
                if (object.deadly == true) {
                    //items.push({ sx:, sy:9, x:actor.pos.x, y:actor.pos.y, deadly:false, type:'looser' });
                    gameOver()
                }
                if (object.type == 'exit') {
                    levelWin()
                }
                if (object.type == 'trampoline') {
                    actor.speed.y < 0 ? actor.speed.y = 0 : true;
                    sound_jump()
                    actor.speed.y = -0.5 * actor.speed.y - 25;
                }
                if (object.type == 'coin') {
                    items.splice(items.indexOf(object), 1);
                    score++
                    sound_coin()
                }
            }

        })

        // move the player when the level is at it's border, else move the level
        if (scroll_x <= 0) {
            if (actor.pos.x > (size.canvas.w / 2)) {
                scroll_x = 1;
            }
        } else if (scroll_x >= current_level.width - size.canvas.w && current_level.width > size.canvas.w) {
            scroll_x = current_level.width - size.canvas.w;
            if (actor.pos.x < current_level.width - (size.canvas.w / 2)) {
                scroll_x = current_level.width - size.canvas.w - 1;
            }
        } else if (current_level.width > size.canvas.w) {
            scroll_x += actor.speed.x;
        }

        // apply friction
        actor.speed.x *= speed.player.friction;

    });
}


function checkCollision(actor, object) {
    var collides = {top:false, bottom:false, left:false, right:false};
    // we are below or above an object (use the middle of the actor, with tolerance)
    if ((actor.pos.x + actor.target_size.w / 2).inRange(object.x - 0.25 * size.tile.target.w, object.x + 1.25 * size.tile.target.w)) {
        // check bounce bottom:
        if ((actor.pos.y + actor.target_size.h).inRange(object.y, object.y + size.tile.target.h - 1) && actor.pos.y < object.y) {
            collides.bottom = true;
            // check bounce top:
        } else if (actor.pos.y.inRange(object.y, object.y + size.tile.target.h)) {
            collides.top = true;
        }
    }
    // we are right or left of an object
    if ((actor.pos.y + actor.target_size.h / 2).inRange(object.y - 0.25 * size.tile.target.h, object.y + 1.25 * size.tile.target.h)) {
        // check bounce right
        if ((actor.pos.x + actor.target_size.w).inRange(object.x, object.x + size.tile.target.w)) {
            collides.right = true;
        }
        // check bounce left
        if (actor.pos.x.inRange(object.x, object.x + size.tile.target.w)) {
            collides.left = true;
        }
    }
    return collides;
}


function animate_actor(actor) {
    if (actor.speed.x > 0) {
        actor.sprite.y = actor.source_size.h;
    } else if (actor.speed.x < 0) {
        actor.sprite.y = actor.source_size.h * 3;
    }

    if (actor.speed.y != 0) {
        // TODO: jump image is not aligned here
        actor.sprite.x = actor.source_size.w * 5 + 8;
    } else {
        if (actor.speed.x == 0) {
            actor.sprite.x = 0;
        } else if (actor.sprite.x >= actor.source_size.w * 3) {
            actor.sprite.x = actor.source_size.w;
        } else if (Math.abs(actor.speed.x) > 1 && (ticks % 3 == 0)) {
            actor.sprite.x += actor.source_size.w;
        }
    }
    if (held.down) {
        // todo: ducken
    }
}

// update special items, enemies
function updateElements() {
    items.forEach(function (item) {

        if (item.type == 'enemy_mushroom') {
            // animate
            if (ticks % 4 == 0) {
                // animate
                if (item.sx == 0) {
                    item.sx = 1;
                } else if (item.sx == 1) {
                    item.sx = 0;
                } else if (item.sx == 2) {
                    items.splice(items.indexOf(item), 1);
                }
            }
            // move
            if (item.speed_x > 0) {
                sprite_collide = getLevelSpriteXY(item.x + size.tile.target.w, item.y)
            } else {
                sprite_collide = getLevelSpriteXY(item.x, item.y)
            }
            sprite_bottom = getLevelSpriteXY(item.x + size.tile.target.w / 2, item.y + size.tile.target.h)
            // turn around on collide or above edge
            if ((blocks[sprite_collide] && blocks[sprite_collide].collide) ||
                (!blocks[sprite_bottom] || !blocks[sprite_bottom].collide || blocks[sprite_bottom].deadly) || item.x <= 0) {
                item.speed_x *= -1;
            }
            item.x += item.speed_x;

        }
    })

}


function drawControls() {
    if (debug) {
        var actor = actors[0];
        ctx.font = '12px edunline';
        if (actor) {
            ctx.fillText("Player: x/y: " + Math.round(actor.pos.x) + "/" + Math.round(actor.pos.y) +
                ", speed x/y: " + Math.round(actor.speed.x) + "/" + Math.round(actor.speed.y) +
                ", animation sprite x/y: " + actor.sprite.x + '/' + actor.sprite.y, size.tile.target.w, size.tile.target.h + 20);
        }
        ctx.fillText("Scroll: " + Math.round(scroll_x) + "px - tile#: " + Math.round(scroll_x / size.tile.target.w), size.tile.target.w, size.tile.target.h + 40);
        ctx.fillText("Objects: " + (collisionMap.length + items.length), size.tile.target.w, size.tile.target.h + 60);
        ctx.fillText("Fps: " + (1000 / frameTime).toFixed(1), size.tile.target.w, size.tile.target.h + 80);
    }
    ctx.font = 'bold 14px edunline';
    ctx.fillText("Score: " + score, size.tile.target.w, size.tile.target.h);
    ctx.fillText(player.lives + " Lives", size.canvas.w - 3 * size.tile.target.w, size.tile.target.h);
}


function drawActors() {
    actors.forEach(function (actor) {
        ctx.drawImage(
            actor.spriteMap,
            actor.sprite.x,
            actor.sprite.y,
            actor.source_size.w,
            actor.source_size.h,
            actor.pos.x - scroll_x_start,
            actor.pos.y,
            actor.target_size.w,
            actor.target_size.h
        );
    });
}


function drawElements() {
    items.forEach(function (item) {
        ctx.drawImage(
            spriteMap,
            item.sx * (size.tile.source.w + 1) + 0.5,
            item.sy * (size.tile.source.h + 1) + 0.5,
            size.tile.source.w - 0.8,
            size.tile.source.h - 0.8,
            item.x - scroll_x_start,
            item.y,
            size.tile.target.w,
            size.tile.target.h
        );
    });
}


function gameOver() {
    sound_dead()
    if (--player.lives > 0) {
       respawnPlayer()
    } else {
        // todo: dying animation
        actors = [];
        showGameOver();
    }
}

function levelWin() {
    sound_success();
    // todo:  winning animation
    actors = [];
    // todo: level done menu
    showGameOver()
}

function initializeLevel() {
    // clone the level content so we still have the original for a restart
    current_level.level = current_level.template.slice(0);
    current_level.width = current_level.level[0].length * size.tile.target.w;
    items = [];
    collisionMap = [];
    actors = [player];
    resetPlayer();
    scroll_x = player.pos.x - (document.documentElement.clientWidth - 4) / 2;
    theme = current_level.theme
}

function resetPlayer() {
    player.lives = 3;
    score = 0;
    player.pos.x = 0;
    respawnPlayer();
}


// todo: re-spawn player at the closest 'y' to the left
function respawnPlayer() {
    if (startpos = getLastLevelSpritePosition('y', player.pos.x)) {
        player.pos.x = startpos.x * size.tile.target.w
        if (player.pos.x >= size.canvas.w/2) {
            scroll_x = startpos.x * size.tile.target.w - size.canvas.w/2;
        } else {
            scroll_x = 0;
        }
        player.pos.y = (startpos.y + line_offset_y) * size.tile.target.h;
    } else {
        player.pos.x = 2 * size.tile.target.w;
        player.pos.y = 5 * size.tile.target.h;
        scroll_x = 0
    }
    player.speed.x = 0;
    player.speed.y = 0;
}

function initializeTheme() {
    spriteMap.src = 'themes/' + theme + '/images/game_tiles.png';
    player.spriteMap.src = 'themes/' + theme + '/images/player_sprites.png';
    player.sprite.x = 0;
    player.sprite.y = 32;
    preload_sounds();
    document.getElementById('game').style.backgroundColor = current_level.background;
    prerenderLevelObjects();
}

function gameLoop() {
    ticks++;
    var thisFrameTime = (thisLoop = new Date) - lastLoop;
    frameTime += (thisFrameTime - frameTime) / filterStrength;
    lastLoop = thisLoop;
    drawLevel();
    updateCharacters();
    updateElements();
    drawElements();
    drawActors();
    drawControls();
}


function initGame() {
    window.clearInterval(gameInterval);
    hideMenus();
    hideControls();
    // draw initial level for menu background
    load_level();
    showStartMenu();
}

function load_level() {
    initializeLevel();
    initDimensions();
    initializeTheme();
    drawLevel();
}

function initDimensions() {
    // re-sizing
    var canvas = document.getElementById("game");
    var browser_w = document.documentElement.clientWidth;
    var browser_h = document.documentElement.clientHeight;
    size.canvas.w = browser_w - 4;
    size.canvas.h = browser_h - 4;
    canvas.width = size.canvas.w;
    canvas.height = size.canvas.h;
    size.tiles.target.w = size.canvas.w / size.tile.target.w;
    size.tiles.target.h = size.canvas.h / size.tile.target.h;
    // if the canvas is not high enough, cut from the upper side, if it's too high, move down
    line_offset_y = size.canvas.h / size.tile.target.h - current_level.level.length;
}


function startGame() {
    hideMenus();
    registerControls();
    initializeLevel();
    initializeTheme();
    sound_theme();
    window.clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, 1000 / speed.fps);
}

function restartGame() {
    window.clearInterval(gameInterval);
    initGame();
    startGame();
}

window.onload = function () {
    initGame();
};

window.onresize = function () {
    initGame();
};

