/* See also:
		http://www.html5rocks.com/en/tutorials/webrtc/basics/
		https://code.google.com/p/webrtc-samples/source/browse/trunk/apprtc/index.html

		https://webrtc-demos.appspot.com/html/pc1.html
*/

// Attach a media stream to an element.
attachMediaStream = function (element, stream) {
	console.log("Attaching media stream");
	element.srcObject = stream;
};

function $id(id) {
	return document.getElementById(id);
}

function $$(s) {
	return Array.from(document.querySelectorAll(s));
}

if (!window.HTMLDialogElement) {
	$$("dialog").forEach(e => dialogPolyfill.registerDialog(e));
}

// Clear out textareas because Firefox caches their contents
for (let textarea of $$("dialog textarea")) {
	textarea.value = "";
}

for (let e of $$("textarea.to-copy")) {
	// Select all on focus
	e.addEventListener("focus", evt => evt.target.select());

	// Trigger submit button on copy
	e.addEventListener("copy", evt => {
			// If done synchronously for some reason it doesn't copy, no idea why 🤷🏽‍
			requestAnimationFrame(() => evt.target.closest("dialog").querySelector(".btn-primary").click());
	});
}

for (let e of $$("textarea.to-paste")) {
	// Trigger submit button on copy
	e.addEventListener("paste", evt => {
			requestAnimationFrame(() => evt.target.closest("dialog").querySelector(".btn-primary").click());
	});
}

var cfg = {"iceServers": [{urls: "stun:23.21.150.121"}]},
	con = { "optional": [{"DtlsSrtpKeyAgreement": true}] };

/* THIS IS ALICE, THE CALLER/SENDER */

var pc1 = new RTCPeerConnection(cfg, con);
var dc1 = null;
var tn1 = null;

// Since the same JS file contains code for both sides of the connection,
// activedc tracks which of the two possible datachannel variables we're using.
var activedc;
var pc1icedone = false;
var sdpConstraints = {
	optional: [],
	mandatory: {
		OfferToReceiveAudio: true,
		OfferToReceiveVideo: true
	}
};

// Show first modal
$id("createOrJoin").showModal();

var buttonActions = {
	createBtn: createLocalOffer,
	joinBtn: function () {
		navigator.mediaDevices.getUserMedia({video: true, audio: true})
			.then(function (stream) {
				var video = $id("localVideo");
				video.srcObject = stream;
				video.play();
				stream.getTracks().forEach(track => pc2.addTrack(track, stream));
			}).catch(function (error) {
				console.log("Error adding stream to pc2: " + error);
			});
	},
	offerRecdBtn: function () {
		var offer = $id("remoteOffer").value;
		try {
				var offerDesc = new RTCSessionDescription(JSON.parse(offer));
		}
		catch (e) {
				console.error("Error parsing offer", offer);
				debugger;
		}
		console.log("Received remote offer", offerDesc);
		writeToChatLog("Received remote offer", "text-success");
		handleOfferFromPC1(offerDesc);
	},
	answerRecdBtn: function () {
		var answer = $id("remoteAnswer").value;
		try {
		var answerDesc = new RTCSessionDescription(JSON.parse(answer));
		}
		catch (e) {
				debugger;
				console.error("Error parsing answer", answer);
		}
		console.log("Received remote answer: ", answerDesc);
		writeToChatLog("Received remote answer", "text-success");
		pc1.setRemoteDescription(answerDesc);
	}
};

for (let id in buttonActions) {
	$id(id).addEventListener("click", buttonActions[id]);
}

for (let button of $$("button[data-show]")) {
		let nextDialogId = button.dataset.show;
		let nextDialog = $id(nextDialogId);

		if (nextDialog) {
			button.addEventListener("click", evt => {
				nextDialog.showModal();
			});

			let backBtn = nextDialog.querySelector(".backBtn");

			if (backBtn) {
				backBtn.addEventListener("click", evt => {
					button.closest("dialog").showModal();
				});
				backBtn.dataset.dismiss = "modal";
			}
		}
		else {
			console.log(button, "triggers dialog", nextDialogId, "which doesn't exist");
		}

		button.dataset.dismiss = "modal";
}

for (let e of $$("[data-dismiss=modal]")) {
	e.addEventListener("click", evt => evt.target.closest("dialog").close());
}

$id("fileBtn").addEventListener("change", function () {
	var file = this.files[0];
	console.log(file);

	sendFile(file);
});

function fileSent (file) {
	console.log(file + " sent");
}

function fileProgress (file) {
	console.log(file + " progress");
}

function sendFile (data) {
	if (data.size) {
		FileSender.send({
			file: data,
			onFileSent: fileSent,
			onFileProgress: fileProgress,
		});
	}
}

function sendMessage () {
	if ($id("messageTextBox").value) {
		var channel = new RTCMultiSession();
		writeToChatLog($id("messageTextBox").value, "text-success");
		channel.send({message: $id("messageTextBox").value});
		$id("messageTextBox").value = "";

		// Scroll chat text area to the bottom on new input.
		$id("chatlog").scrollTop = $id("chatlog").scrollHeight;
	}

	return false;
}

function createLocalOffer () {
	console.log("video1");
	navigator.mediaDevices.getUserMedia({video: true, audio: true})
		.then(function (stream) {
			var video = document.getElementById("localVideo");
			video.srcObject = stream;
			video.play();
			stream.getTracks().forEach(track => pc1.addTrack(track, stream));
			console.log("adding stream to pc1", stream);

			// Setup DC1
			try {
				var fileReceiver1 = new FileReceiver();
				activedc = dc1 = pc1.createDataChannel("test", {reliable: true});
				console.log("Created datachannel (pc1)");

				dc1.onopen = function (e) {
					console.log("data channel connect");
					$id("waitForConnection").close();
					$id("waitForConnection").remove();
				};

				dc1.onmessage = function (e) {
					console.log("Got message (pc1)", e.data);
					if (e.data.size) {
						fileReceiver1.receive(e.data, {});
					}
					else {
						if (e.data.charCodeAt(0) == 2) {
							// The first message we get from Firefox (but not Chrome)
							// is literal ASCII 2 and I don't understand why -- if we
							// leave it in, JSON.parse() will barf.
							return;
						}
						console.log(e);
						var data = JSON.parse(e.data);
						if (data.type === "file") {
							fileReceiver1.receive(e.data, {});
						}
						else {
							writeToChatLog(data.message, "text-info");
							// Scroll chat text area to the bottom on new input.
							$id("chatlog").scrollTop = $id("chatlog").scrollHeight;
						}
					}
				};
			}
			catch (e) {
				console.warn("No data channel (pc1)", e);
			}

			pc1.createOffer(sdpConstraints)
				.then(desc => {
					pc1.setLocalDescription(desc, function () {}, function () {});
					console.log("created local offer", desc);
				})
				.catch(() => {
					console.warn("Couldn't create offer");
				});
		}).catch(function (error) {
			console.log("Error adding stream to pc1: " + error);
		});
}

pc1.onicecandidate = function (e) {
	// console.log('ICE candidate (pc1)', e)
	if (e.candidate == null) {
		$id("localOffer").value = JSON.stringify(pc1.localDescription);
		$id("localOffer").select();
	}
};

function handleOnaddstream (e) {
	console.log("Got remote stream", e.streams[0]);
	var el = document.getElementById("remoteVideo");
	el.autoplay = true;
	attachMediaStream(el, e.streams[0]);
}

pc1.ontrack = handleOnaddstream;

function handleOnconnection () {
	console.log("Datachannel connected");
	writeToChatLog("Datachannel connected", "text-success");
	$id("waitForConnection").close();
	// If we didn't call remove() here, there would be a race on pc2:
	//   - first onconnection() hides the dialog, then someone clicks
	//     on answerSentBtn which shows it, and it stays shown forever.
	$id("waitForConnection").remove();
	$id("showLocalAnswer").close();
	$id("messageTextBox").focus();
}

pc1.onconnection = handleOnconnection;

function onsignalingstatechange (state) {
	console.info("signaling state change:", state);
}

function oniceconnectionstatechange (state) {
	console.info("ice connection state change:", state);
}

function onicegatheringstatechange (state) {
	console.info("ice gathering state change:", state);
}

pc1.onsignalingstatechange = onsignalingstatechange;
pc1.oniceconnectionstatechange = oniceconnectionstatechange;
pc1.onicegatheringstatechange = onicegatheringstatechange;

function handleCandidateFromPC2 (iceCandidate) {
	pc1.addIceCandidate(iceCandidate);
}

/* THIS IS BOB, THE ANSWERER/RECEIVER */

var pc2 = new RTCPeerConnection(cfg, con),
	dc2 = null;

var pc2icedone = false;

pc2.ondatachannel = function (e) {
	var fileReceiver2 = new FileReceiver();
	var datachannel = e.channel || e; // Chrome sends event, FF sends raw channel
	console.log("Received datachannel (pc2)", arguments);
	dc2 = datachannel;
	activedc = dc2;
	dc2.onopen = function (e) {
		console.log("data channel connect");
		$id("waitForConnection").close();
		$id("waitForConnection").remove();
	};
	dc2.onmessage = function (e) {
		console.log("Got message (pc2)", e.data);
		if (e.data.size) {
			fileReceiver2.receive(e.data, {});
		}
	else {
			var data = JSON.parse(e.data);
			if (data.type === "file") {
				fileReceiver2.receive(e.data, {});
			}
	else {
				writeToChatLog(data.message, "text-info");
				// Scroll chat text area to the bottom on new input.
				$id("chatlog").scrollTop = $id("chatlog").scrollHeight;
			}
		}
	};
};

function handleOfferFromPC1 (offerDesc) {
	pc2.setRemoteDescription(offerDesc);
	pc2.createAnswer(function (answerDesc) {
		writeToChatLog("Created local answer", "text-success");
		console.log("Created local answer: ", answerDesc);
		pc2.setLocalDescription(answerDesc);
	},
	function () {
	console.warn("Couldn't create offer");
},
	sdpConstraints);
}

pc2.onicecandidate = function (e) {
	// console.log('ICE candidate (pc2)', e)
	if (e.candidate == null) {
		$id("localAnswer").value = JSON.stringify(pc2.localDescription);
		$id("localAnswer").select();
	}
};

pc2.onsignalingstatechange = onsignalingstatechange;
pc2.oniceconnectionstatechange = oniceconnectionstatechange;
pc2.onicegatheringstatechange = onicegatheringstatechange;

function handleCandidateFromPC1 (iceCandidate) {
	pc2.addIceCandidate(iceCandidate);
}

pc2.ontrack = handleOnaddstream;
pc2.onconnection = handleOnconnection;

function getTimestamp () {
	var totalSec = new Date().getTime() / 1000;
	var hours = parseInt(totalSec / 3600) % 24;
	var minutes = parseInt(totalSec / 60) % 60;
	var seconds = parseInt(totalSec % 60);

	var result = (hours < 10 ? "0" + hours : hours) + ":" +
		(minutes < 10 ? "0" + minutes : minutes) + ":" +
		(seconds < 10 ? "0" + seconds : seconds);

	return result;
}

function writeToChatLog (message, message_type) {
	document.getElementById("chatlog").innerHTML += '<p class="' + message_type + '">' + "[" + getTimestamp() + "] " + message + "</p>";
}
