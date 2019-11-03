/* See also:
		http://www.html5rocks.com/en/tutorials/webrtc/basics/
		https://code.google.com/p/webrtc-samples/source/browse/trunk/apprtc/index.html

		https://webrtc-demos.appspot.com/html/pc1.html
*/

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

var buttonActions = {
	createBtn: async function createLocalOffer () {
		try {
			var stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
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

				dc1.onopen = DCOnOpen;
				dc1.onmessage = DCOnMessage(fileReceiver1);
			}
			catch (e) {
				console.warn("No data channel (pc1)", e);
			}

			try {
				var desc = await pc1.createOffer(sdpConstraints);
				pc1.setLocalDescription(desc);
				console.log("created local offer", desc);
			}
			catch (e) {
				console.error("Couldn't create offer");
			}
		}
		catch (e) {
			console.error("Error adding stream to pc1:", error);
		}
	},
	joinBtn: async function () {
		try {
			var stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
			var video = $id("localVideo");
			video.srcObject = stream;
			video.play();
			stream.getTracks().forEach(track => pc2.addTrack(track, stream));
		}
		catch (e) {
			console.log("Error adding stream to pc2:", error);
		}
	},
	offerRecdBtn: async function () {
		var offer = $id("remoteOffer").value;
		try {
			var offerDesc = new RTCSessionDescription(JSON.parse(offer));
		}
		catch (e) {
			console.error("Error parsing offer", offer);
		}

		console.log("Received remote offer", offerDesc);
		writeToChatLog("Received remote offer");

		// Handle offer from PC1
		pc2.setRemoteDescription(offerDesc);

		try {
			var answerDesc = await pc2.createAnswer(sdpConstraints);
			writeToChatLog("Created local answer");
			console.log("Created local answer: ", answerDesc);
			pc2.setLocalDescription(answerDesc);
		}
		catch (e) {
			console.warn("Couldn't create offer");
		}
	},
	answerRecdBtn: function () {
		var answer = $id("remoteAnswer").value;

		try {
			var answerDesc = new RTCSessionDescription(JSON.parse(answer));
		}
		catch (e) {
			console.error("Error parsing answer", answer);
		}

		console.log("Received remote answer: ", answerDesc);
		writeToChatLog("Received remote answer");
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

// Show first modal
$id("createOrJoin").showModal();

$id("fileBtn").addEventListener("change", function () {
	var file = this.files[0];
	console.log(file);

	// Send file
	if (file.size) {
		FileSender.send({
			file: file,
			onFileSent: function fileSent (file) {
				console.log(file + " sent");
			},
			onFileProgress: function fileProgress (file) {
				console.log(file + " progress");
			},
		});
	}
});

function sendMessage () {
	if ($id("messageTextBox").value) {
		var channel = new RTCMultiSession();
		writeToChatLog($id("messageTextBox").value);
		channel.send({message: $id("messageTextBox").value});
		$id("messageTextBox").value = "";

		// Scroll chat text area to the bottom on new input.
		$id("chatlog").scrollTop = $id("chatlog").scrollHeight;
	}

	return false;
}

function DCOnOpen(e) {
	$id("waitForConnection").close();
	$id("waitForConnection").remove();
}

function DCOnMessage(fileReceiver) {
	return function (e) {
		// console.log("Got message (pc1)", e.data);
		if (e.data.size) {
			fileReceiver.receive(e.data, {});
		}
		else {
			if (e.data.charCodeAt(0) == 2) {
				// The first message we get from Firefox (but not Chrome)
				// is literal ASCII 2 and I don't understand why -- if we
				// leave it in, JSON.parse() will barf.
				console.log("Firefox weirdness");
				return;
			}

			// console.log(e);
			var data = JSON.parse(e.data);

			if (data.type === "file") {
				fileReceiver.receive(e.data, {});
			}
			else {
				writeToChatLog(data.message, "text-info");
				// Scroll chat text area to the bottom on new input.
				$id("chatlog").scrollTop = $id("chatlog").scrollHeight;
			}
		}
	}
}

const cfg = {"iceServers": [{urls: "stun:23.21.150.121"}]};
const con = { "optional": [{"DtlsSrtpKeyAgreement": true}] };

/* THIS IS ALICE, THE CALLER/SENDER */
var pc1 = new RTCPeerConnection(cfg, con);
var dc1 = null;

/* THIS IS BOB, THE ANSWERER/RECEIVER */
var pc2 = new RTCPeerConnection(cfg, con);
var dc2 = null;

// Since the same JS file contains code for both sides of the connection,
// activedc tracks which of the two possible datachannel variables we're using.
var activedc;
var sdpConstraints = {
	optional: [],
	mandatory: {
		OfferToReceiveAudio: true,
		OfferToReceiveVideo: true
	}
};

Object.assign(pc1, {
	onicecandidate: function (e) {
		// console.log('ICE candidate (pc1)', e)
		if (e.candidate == null) {
			$id("localOffer").value = JSON.stringify(pc1.localDescription);
			$id("localOffer").select();
		}
	}
});

Object.assign(pc2, {
	ondatachannel: function (e) {
		var fileReceiver2 = new FileReceiver();

		// console.log("Received datachannel (pc2)", arguments);
		activedc = dc2 = e.channel;
		dc2.onopen = DCOnOpen;
		dc2.onmessage = DCOnMessage(fileReceiver2);
	},
	onicecandidate: function (e) {
		// console.log('ICE candidate (pc2)', e)
		if (e.candidate == null) {
			$id("localAnswer").value = JSON.stringify(pc2.localDescription);
			$id("localAnswer").select();
		}
	}
})

pc1.ontrack = pc2.ontrack = function (e) {
	$id("remoteVideo").srcObject = e.streams[0];
};

pc1.onconnection = pc2.onconnection = function handleOnconnection () {
	writeToChatLog("Datachannel connected");
	$id("waitForConnection").close();

	// If we didn't call remove() here, there would be a race on pc2:
	//   - first onconnection() hides the dialog, then someone clicks
	//     on answerSentBtn which shows it, and it stays shown forever.
	$id("waitForConnection").remove();
	$id("showLocalAnswer").close();
	$id("messageTextBox").focus();
};

function writeToChatLog (message, messageType = "text-success") {
	var timestamp = (new Date).toLocaleString("en-us", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false
	});

	$id("chatlog").innerHTML += `<p class="${messageType}">[${timestamp}] ${message}</p>`;
}
